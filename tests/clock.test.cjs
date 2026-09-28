const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../clock.js');
for (const minutes of [20, 22]) test(`${minutes}-minute clock switches and pauses without drift`, () => {
  let now = 0; const c = C.create(minutes, () => now);
  c.switchTo('player'); now = 1234; c.switchTo('bot'); now += 5678;
  const s = c.pause(); now += 100000;
  assert.deepEqual(c.snapshot(), s);
  assert.equal(s.remainingMs.player, minutes * 60000 - 1234);
  assert.equal(s.remainingMs.bot, minutes * 60000 - 5678);
});
test('overtime boundaries and delayed timer callback', () => {
  let now = 0; const c = C.create(20, () => now); c.switchTo('player');
  for (const [extra, penalty, expired] of [[0,0,false],[1,10,false],[60000,10,false],[60001,20,false],[300000,50,false],[300001,50,true],[900000,50,true]]) {
    now = 1200000 + extra; const s = c.snapshot();
    assert.equal(s.penalties.player, penalty); assert.equal(s.expired.includes('player'), expired);
  }
});
test('adjudication: normal penalty, losing, leading, tied and both lost', () => {
  const rack = { player: 10, bot: 5 };
  const clock = { penalties: { player: 50, bot: 0 }, expired: ['player'], bothExpired: false };
  assert.deepEqual(C.adjudicate({player:200,bot:100},rack,clock).scores,{player:45,bot:95});
  assert.deepEqual(C.adjudicate({player:80,bot:100},rack,clock).scores,{player:20,bot:95});
  const tie = C.adjudicate({player:155,bot:100},rack,clock);
  assert.equal(tie.scores.player,tie.scores.bot); assert.equal(tie.loser,'player');
  assert.equal(C.adjudicate({player:200,bot:100},rack,{...clock,bothExpired:true,penalties:{player:50,bot:50}}).bothLost,true);
  assert.deepEqual(C.adjudicate({player:200,bot:100},rack,{penalties:{player:10,bot:20},expired:[],bothExpired:false}).scores,{player:190,bot:80});
});
function harness() {
  let now = 0, finalized, botWork = 0;
  const nodes = new Map();
  const document = {addEventListener(){},getElementById(id){
    if (!nodes.has(id)) nodes.set(id,{hidden:false,classList:{toggle(){}},textContent:''});
    return nodes.get(id);
  }};
  const context = {document, window:{addEventListener(){}}, performance:{now:()=>now},
    setInterval:()=>1,clearInterval(){},setTimeout:()=>2,clearTimeout(){},
    AMATH_CLOCK:C, AMATH_DATA:{CLOCK_MINUTES:20}, AMATH_ENGINE:{},
    AMATH_GAME_BOT:{findMove(){now += botWork; return {found:false};}},
    AMATS_LOGGER:{markTurnStart(){},logBotTurn(){},finalizeMatch(data){finalized=data;return data;}}};
  vm.createContext(context);
  let src = fs.readFileSync(require.resolve('../app.js'),'utf8');
  src = src.replace('  /* ---------- Init ---------- */', `
    renderAll = () => {}; renderSummary = () => {}; log = () => {}; showToast = () => {};
    globalThis.api = {
      setup(side='player') {
        clock = AMATH_CLOCK.create(20, () => performance.now()); clock.switchTo(side);
        currentTurn=side; gameOver=false; playerScore=200; botScore=100;
        playerRack=[{points:10}]; botRack=[{points:5}]; bag=[];
        board=[[null]]; pendingCoords=[]; nonScoringAfterBagEmpty={player:0,bot:0};
      }, passTurn, botTakeTurn, checkClock, endGame,
      pending() { playerScore=80; board[0][0]={points:3,face:'3',kind:'number',id:'x'}; pendingCoords=[{r:0,c:0}]; },
      state() {return {gameOver,currentTurn,playerScore,botScore,clock:clock.snapshot()};}
    };
  /* ---------- Init ---------- */`);
  context.AMATH_DATA.OPERATOR_TILES={};
  vm.runInContext(src,context);
  return {api:context.api, advance(ms){now+=ms;}, work(ms){botWork=ms;}, final(){return finalized;}};
}
test('pass switches clocks; bot pass restores player turn and clock', () => {
  const h=harness();h.api.setup();h.advance(1234);h.api.passTurn();
  assert.equal(h.api.state().clock.active,'bot');h.advance(700);h.work(2500);h.api.botTakeTurn();
  const s=h.api.state();assert.equal(s.clock.active,'player');assert.equal(s.clock.remainingMs.bot,1200000-3200);
});
test('bot search crossing time limit cannot commit a turn', () => {
  const h=harness();h.api.setup('bot');h.work(1500001);h.api.botTakeTurn();
  assert.equal(h.api.state().gameOver,true);assert.equal(h.final().result,'win');
  assert.equal(h.final().finalBotScore,45);
});
test('timeout counts unsubmitted tiles and finalizes only once', () => {
  const h=harness();h.api.setup();h.api.pending();h.advance(1500001);h.api.checkClock();
  const f=h.final(); assert.equal(f.finalPlayerScore,17);assert.equal(f.result,'loss');
  h.api.passTurn();h.api.endGame('again');assert.equal(h.final(),f);
});
test('normal game end deducts time once and freezes clock', () => {
  const h=harness();h.api.setup();h.advance(1200001);h.api.endGame('normal');
  assert.equal(h.final().finalPlayerScore,190);const s=h.api.state().clock.remainingMs.player;
  h.advance(900000);assert.equal(h.api.state().clock.remainingMs.player,s);
});
test('actual rulesets provide correct durations and bag totals', () => {
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../rulesets.js'),'utf8')+'\nglobalThis.rules=AMATH_RULESETS;',ctx);
  assert.equal(ctx.rules.PRIMARY_70.clockMinutes,20);
  assert.equal(ctx.rules.STANDARD_100.clockMinutes,22);
  assert.equal(ctx.rules.tileCount(ctx.rules.PRIMARY_70),70);
  assert.equal(ctx.rules.tileCount(ctx.rules.STANDARD_100),100);
});
