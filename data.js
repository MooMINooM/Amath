/* A-Math Game — board data + active ruleset adapter.
 * Game logic reads AMATH_DATA; tile-set differences live in AMATH_RULESETS.
 */
const AMATH_DATA = (() => {
  const BOARD_SIZE = 15;
  const CENTER = [7, 7];
  let activeRuleset = AMATH_RULESETS.STANDARD_100;

  const TE = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
  const DE = [[1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
              [1,13],[2,12],[3,11],[4,10],[13,1],[12,2],[11,3],[10,4]];
  const TP = [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]];
  const DP = [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
              [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]];

  const bonusMap = new Map();
  TE.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "TE"));
  DE.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "DE"));
  TP.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "TP"));
  DP.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "DP"));
  bonusMap.set(`${CENTER[0]},${CENTER[1]}`, "TP");

  function bonusAt(r,c) { return bonusMap.get(`${r},${c}`) || null; }
  function isCenter(r,c) { return r === CENTER[0] && c === CENTER[1]; }

  function setRuleset(id) {
    const next = AMATH_RULESETS.ALL[id];
    if (!next) throw new Error(`Unknown A-Math ruleset: ${id}`);
    activeRuleset = next;
    return activeRuleset;
  }

  function getRuleset() { return activeRuleset; }

  function buildBag() {
    const bag = [];
    let seq = 0;
    for (const [num, def] of Object.entries(activeRuleset.numbers)) {
      for (let i=0;i<def.count;i++) {
        bag.push({id:"t"+(seq++),kind:"number",face:num,points:def.points});
      }
    }
    for (const [sym, def] of Object.entries(activeRuleset.operators)) {
      for (let i=0;i<def.count;i++) {
        bag.push({
          id:"t"+(seq++),
          kind:def.choices ? "wildcard-op" : "operator",
          face:sym,
          points:def.points,
          choices:def.choices || null,
        });
      }
    }
    for (let i=0;i<activeRuleset.blank.count;i++) {
      bag.push({
        id:"t"+(seq++),
        kind:"blank",
        face:"BLANK",
        points:0,
        choices:activeRuleset.blank.choices.slice(),
      });
    }
    for (let i=bag.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [bag[i],bag[j]]=[bag[j],bag[i]];
    }
    return bag;
  }

  return {
    BOARD_SIZE, CENTER, bonusAt, isCenter, setRuleset, getRuleset, buildBag,
    get RACK_SIZE(){ return activeRuleset.rackSize; },
    get TOTAL_TILES(){ return activeRuleset.totalTiles; },
    get CLOCK_MINUTES(){ return activeRuleset.clockMinutes; },
    get NUMBER_TILES(){ return activeRuleset.numbers; },
    get OPERATOR_TILES(){ return activeRuleset.operators; },
    get BLANK_TILE(){ return activeRuleset.blank; },
    get RULESET_ID(){ return activeRuleset.id; },
    get RULESET_LABEL(){ return activeRuleset.label; },
  };
})();
