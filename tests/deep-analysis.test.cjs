const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function harness() {
  const html = fs.readFileSync(path.join(root, 'teacher.html'), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id]) => [id, {
    id, value: id === 'deep-trend-metric' ? 'score' : id === 'deep-turn-range' ? '30' : 'all',
    innerHTML: '', textContent: '', hidden: false, title: '',
    addEventListener() {}, setAttribute() {}, querySelectorAll() { return []; },
    classList: {toggle() {}}, scrollIntoView() {},
  }]));
  const configs = new Map();
  class Chart {constructor(el, config) {assert.ok(el, 'canvas must exist');configs.set(el.id, config);}destroy() {}}
  const context = {window:{},Chart,document:{getElementById:id=>elements.get(id),addEventListener(){},querySelectorAll(){return [];}},setInterval(){}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'teacher-deep-analysis.js'),'utf8'), context);
  return {api:context.window.AMATH_DEEP_ANALYSIS,elements,configs};
}
test('analysis excludes unavailable telemetry from averages and preserves real zeroes', () => {
  const {api} = harness();
  const model = api.summarize([{id:'m1',status:'finished',result:'win',final_player_score:0}], [
    {actor:'bot',turn_number:0,event_type:'move',decision_quality:100},
    {actor:'player',turn_number:1,event_type:'move',decision_quality:null,decision_time_ms:null,tactical_loss:null},
    {actor:'player',turn_number:2,event_type:'move',decision_quality:80,decision_time_ms:12000,tactical_loss:0,threat_before:'Low'},
  ]);
  assert.equal(model.score,0);assert.equal(model.win,100);assert.equal(model.dq,80);
  assert.equal(model.time,12000);assert.equal(model.loss,0);assert.equal(model.risk,'Low');
  assert.equal(api.summarize([],[]).win,null);
});
test('dashboard renders real data and clears previous charts when changing students', () => {
  const {api,elements,configs} = harness();
  const data = {student:{user_id:'s1',full_name:'นักเรียน <หนึ่ง>',student_code:'S001'},studentMatches:[{id:'m1',status:'finished',result:'win',final_player_score:12,final_bot_score:5}],
    turns:[{id:1,match_id:'m1',actor:'player',turn_number:1,event_type:'move',move_score:12,decision_quality:80,decision_time_ms:12000,tactical_loss:4,threat_before:'Low',suggested_mode:'BUILD',equation:'7 + 5 = 12'}],
    peerTurns:[],peerMatches:[],peerLiveRows:[],liveRow:null,studentCount:1,onReplay(){},onReload(){}};
  api.render(data);
  assert.equal(configs.size,7);
  assert.equal(configs.get('dq-trend-chart').data.datasets[0].data[0],80);
  assert.equal(configs.get('decision-time-chart').data.datasets[0].data[0],12);
  assert.match(elements.get('student-kpis').innerHTML,/LOW/);
  assert.match(elements.get('deep-heatmap').innerHTML,/ยังไม่มี Board Snapshot/);
  api.begin();assert.equal(elements.get('deep-match-log').hidden,true);
  api.render({...data,studentMatches:[],turns:[]});
  assert.match(elements.get('deep-dq-badge').textContent,/—/);
  assert.equal(configs.get('dq-trend-chart').data.datasets[0].data.length,0);
  for (const element of elements.values()) assert.doesNotMatch(element.innerHTML,/NaN|Infinity/);
});
