/* Data-backed rendering for the student Deep Analysis console. */
(() => {
  const $ = id => document.getElementById(id);
  const colors = {blue:'#19baff',red:'#ff426b',purple:'#c967ee',green:'#21e78b',yellow:'#ffd23b',muted:'#88a7c7'};
  let state = null;
  let charts = {};
  const num = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const avg = values => { const xs=values.map(num).filter(v=>v!=null); return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null; };
  const format = (value, digits=0, suffix='') => num(value)==null ? '—' : Number(value).toFixed(digits)+suffix;
  const esc = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = value => Math.max(0,Math.min(100,value));
  const playerMoves = turns => turns.filter(t=>t.actor==='player' && (t.event_type || 'move')==='move' && Number(t.turn_number)>0);
  function summarize(matches,turns) {
    const finished=matches.filter(m=>m.status==='finished'), player=playerMoves(turns);
    return {player,finished,score:avg(finished.map(m=>m.final_player_score)),win:finished.length ? finished.filter(m=>m.result==='win').length/finished.length*100 : null,
      dq:avg(player.map(t=>t.decision_quality)),loss:avg(player.map(t=>t.tactical_loss)),time:avg(player.map(t=>t.decision_time_ms)),risk:player.at(-1)?.threat_before ?? null};
  }
  function spark(values,color) {
    const xs=values.map(num).filter(x=>x!=null).slice(-20);
    if(xs.length<2)return '<div class="deep-spark-empty"></div>';
    const lo=Math.min(...xs),range=Math.max(1,Math.max(...xs)-lo);
    return `<svg viewBox="0 0 160 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 23H160" stroke="#1c4057"/><polyline fill="none" stroke="${color}" stroke-width="2" points="${xs.map((v,i)=>`${i/(xs.length-1)*160},${21-(v-lo)/range*17}`).join(' ')}"/></svg>`;
  }
  function chart(id,type,labels,datasets,extra={}) {
    if(typeof Chart==='undefined')return;
    if(charts[id])charts[id].destroy();
    charts[id]=new Chart($(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:datasets.length>1,position:'top',labels:{color:'#b8d3e6',boxWidth:9,font:{size:9}}},tooltip:{enabled:true}},scales:{x:{grid:{color:'#123247'},ticks:{color:'#a3bdd2',font:{size:9},maxTicksLimit:7}},y:{beginAtZero:true,grid:{color:'#123247'},ticks:{color:'#a3bdd2',font:{size:9},maxTicksLimit:5}}},...extra}});
  }
  const line = (label,data,color) => ({label,data,borderColor:color,backgroundColor:color+'22',pointRadius:2,borderWidth:2,tension:.25,spanGaps:false});
  const bar = (label,data,color) => ({label,data,backgroundColor:color,borderRadius:2});
  function renderHeader(model) {
    const {student,liveRow,studentMatches,turns}=state;
    const latest=studentMatches.at(-1),date=turns.at(-1)?.occurred_at || latest?.finished_at || latest?.started_at;
    $('student-detail-name').textContent=student.full_name || student.student_code;
    $('deep-student-code').textContent=student.student_code || '—';
    $('student-detail-meta').textContent=`${student.class_name || '—'}  |  ห้องเรียน ${student.room_no || '—'}`;
    $('deep-student-count').textContent=state.studentCount;
    $('deep-live-status').textContent=liveRow?.status==='playing'?'● LIVE':'● HISTORY';
    $('deep-sync-label').textContent=new Date().toLocaleTimeString('th-TH');
    const ruleset=liveRow?.ruleset_id || latest?.ruleset_id;
    const rule=latest?.ruleset_label || ({PRIMARY_70:'ประถม 70 เบี้ย',STANDARD_100:'Standard Ruleset'})[ruleset] || '—';
    const level=liveRow?.difficulty || latest?.difficulty;
    $('deep-header-ruleset').textContent=rule;
    $('deep-header-level').textContent=({Rookie:'Beginner',Standard:'Intermediate',Master:'Advanced'})[level] || level || '—';
    const metas=[['⚙','Ruleset',rule],['▥','Bot Level',({Rookie:'Beginner',Standard:'Intermediate',Master:'Advanced'})[level] || level || '—'],['♛','Win Rate',format(model.win,0,'%')],['◈','Decision Quality',format(model.dq,0,'/100')],['◷','Avg Time',format(model.time==null?null:model.time/1000,1,'s')],['⟳','Last Update',date?new Date(date).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—']];
    $('deep-profile-meta').innerHTML=metas.map(([icon,label,value])=>`<div><span class="deep-icon" aria-hidden="true">${icon}</span><div><small>${label}</small><strong title="${esc(value)}">${esc(value)}</strong></div></div>`).join('');
    $('deep-dq-badge').textContent='Avg '+format(model.dq,0,'/100');
    $('deep-time-badge').textContent='Avg '+format(model.time==null?null:model.time/1000,1,'s');
    $('deep-loss-badge').textContent='Avg '+format(model.loss,1,' pts');
    const metrics=[['♛','SCORE AVG',model.score,0,'',colors.blue,model.finished.map(m=>m.final_player_score)],['♛','WIN %',model.win,0,'%',colors.green,model.finished.map((m,i,ms)=>ms.slice(0,i+1).filter(x=>x.result==='win').length/(i+1)*100)],['◈','DQ',model.dq,0,'',colors.blue,model.player.map(t=>t.decision_quality)],['◷','AVG TIME',model.time==null?null:model.time/1000,1,'s',colors.purple,model.player.map(t=>num(t.decision_time_ms)==null?null:t.decision_time_ms/1000)],['✕','TACTICAL LOSS',model.loss,1,' pts',colors.red,model.player.map(t=>t.tactical_loss)],['▦','RACK QUALITY',liveRow?.rack_quality,0,'/100',colors.yellow,[]],['⬟','PRESSURE',liveRow?.pressure_level,0,'/100',colors.purple,[]],['▲','RISK',model.risk,1,'',colors.green,[]]];
    $('student-kpis').innerHTML=metrics.map(([icon,label,value,digits,suffix,color,values])=>`<div class="deep-kpi" ${label==='RACK QUALITY'?'id="deep-rack-quality"':''} style="--metric-color:${color}"><div class="deep-kpi-top"><span aria-hidden="true">${icon}</span><div><small>${label}</small><strong>${label==='RISK' && typeof value==='string' ? esc(value.toUpperCase()) : format(value,digits,suffix)}</strong></div></div>${spark(values,color)}</div>`).join('');
  }
  function cumulative(turns,actor) {
    let score=0;
    return turns.filter(t=>(t.event_type || 'move')==='move' && t.actor===actor && Number(t.turn_number)>0).map(t=>({turn:t.turn_number,value:score+=Number(t.move_score)||0}));
  }
  function classByTurn(metric) {
    const groups=new Map();
    const byMatch=new Map();
    state.peerTurns.forEach(t=>{if(!byMatch.has(t.match_id))byMatch.set(t.match_id,[]);byMatch.get(t.match_id).push(t);});
    for(const turns of byMatch.values()) {
      let score=0;
      for(const t of playerMoves(turns)) {
        score+=Number(t.move_score)||0;
        const value=metric==='score'?score:metric==='dq'?num(t.decision_quality):num(t.decision_time_ms)==null?null:t.decision_time_ms/1000;
        if(!groups.has(t.turn_number))groups.set(t.turn_number,[]);
        groups.get(t.turn_number).push(value);
      }
    }
    return groups;
  }
  function renderCharts() {
    const model=state.model,limit=Number($('deep-turn-range').value),metric=$('deep-trend-metric').value;
    const lastMatch=state.turns.at(-1)?.match_id;
    const matchTurns=state.turns.filter(t=>t.match_id===lastMatch),allPlayer=playerMoves(matchTurns);
    const player=limit?allPlayer.slice(-limit):allPlayer;
    $('deep-performance').title='Latest match · DQ, time and loss use the latest loaded telemetry (up to 2,000 events)';
    const labels=player.map(t=>t.turn_number),classValues=classByTurn(metric);
    const scoreMap=new Map(cumulative(matchTurns,'player').map(x=>[x.turn,x.value]));
    const primary=player.map(t=>metric==='score'?scoreMap.get(t.turn_number):metric==='dq'?num(t.decision_quality):num(t.decision_time_ms)==null?null:t.decision_time_ms/1000);
    const trend=[line('Student',primary,colors.blue)];
    if(state.peerTurns.length)trend.push(line('Class Avg',labels.map(t=>avg(classValues.get(t)||[])),colors.red));
    if(metric==='score') {const bot=cumulative(matchTurns,'bot');trend.push(line('Bot',labels.map(t=>bot.filter(x=>Number(x.turn)<=Number(t)).at(-1)?.value ?? 0),colors.yellow));}
    chart('score-trend-chart','line',labels,trend);
    const peerDQ=classByTurn('dq'),peerTime=classByTurn('time');
    chart('dq-trend-chart','bar',labels,[bar('DQ',player.map(t=>num(t.decision_quality)),colors.blue),...(state.peerTurns.length?[bar('Class Avg',labels.map(t=>avg(peerDQ.get(t)||[])),colors.muted)]:[])]);
    chart('decision-time-chart','bar',labels,[bar('Student',player.map(t=>num(t.decision_time_ms)==null?null:t.decision_time_ms/1000),colors.purple),...(state.peerTurns.length?[{...line('Class Avg',labels.map(t=>avg(peerTime.get(t)||[])),colors.muted),type:'line'}]:[])]);
    chart('loss-chart','bar',labels,[bar('Tactical Loss (points)',player.map(t=>num(t.tactical_loss)),colors.red)]);
    const profileModel=state.analytics?.student?.profile || {
      decisionQuality:model.dq,
      scoring:model.player.length?clamp((avg(model.player.map(t=>t.move_score))||0)/20*100):null,
      speed:model.time==null?null:clamp(100-model.time/600),
      rackManagement:num(state.liveRow?.rack_quality),
      tacticalControl:model.loss==null?null:clamp(100-model.loss*5)
    };
    const profile=[profileModel.decisionQuality,profileModel.scoring,profileModel.speed,profileModel.rackManagement,profileModel.tacticalControl];
    const peer=state.peerModel;
    const peerRack=avg((state.peerLiveRows || []).map(r=>r.rack_quality));
    const peerProfileModel=state.analytics?.classAverage?.profile || {
      decisionQuality:peer.dq,
      scoring:peer.player.length?clamp((avg(peer.player.map(t=>t.move_score))||0)/20*100):null,
      speed:peer.time==null?null:clamp(100-peer.time/600),
      rackManagement:peerRack,
      tacticalControl:peer.loss==null?null:clamp(100-peer.loss*5)
    };
    const peerProfile=[peerProfileModel.decisionQuality,peerProfileModel.scoring,peerProfileModel.speed,peerProfileModel.rackManagement,peerProfileModel.tacticalControl];
    const profileSets=[{...line('Student',profile,colors.blue),fill:true},...(peer.player.length?[{...line('Class Avg',peerProfile,colors.muted),fill:false}]:[])];
    chart('deep-profile-chart','radar',['DQ','Scoring','Speed','Rack','Control'],profileSets,{scales:{r:{min:0,max:100,ticks:{display:false},grid:{color:'#285067'},angleLines:{color:'#285067'},pointLabels:{color:'#abc8dc',font:{size:9}}}},plugins:{legend:{display:profileSets.length>1,position:'top',labels:{color:'#b7d4e6',font:{size:9},boxWidth:9}},tooltip:{enabled:true}}});
    const modes=['PRESS','CONTROL','BUILD','DENY','GUARD','RESET','Unclassified'];
    const counts=modes.map(mode=>model.player.filter(t=>mode==='Unclassified'?!modes.includes(t.suggested_mode):t.suggested_mode===mode).length);
    chart('result-chart','doughnut',modes,[{data:counts,backgroundColor:[colors.red,colors.blue,colors.purple,colors.yellow,colors.green,'#ed8c43',colors.muted],borderWidth:0}],{scales:{},cutout:'62%',plugins:{legend:{display:true,position:'right',labels:{color:'#b7d4e6',boxWidth:9,font:{size:9}}}}});
    const benchmark=state.analytics?.benchmark;
    if (benchmark) {
      chart('deep-benchmark-chart','bar',benchmark.labels,[
        bar('Student',benchmark.student,colors.blue),
        bar('Class Avg',benchmark.classAverage,colors.muted),
        bar('Opponent',benchmark.opponent,colors.yellow)
      ]);
    } else {
      const botTime=avg(state.turns.filter(t=>t.actor==='bot').map(t=>t.decision_time_ms));
      chart('deep-benchmark-chart','bar',['Score','Win %','DQ','Time (s)','Loss (pts)','Rack'],[
        bar('Student',[model.score,model.win,model.dq,model.time==null?null:model.time/1000,model.loss,num(state.liveRow?.rack_quality)],colors.blue),
        bar('Class Avg',[peer.score,peer.win,peer.dq,peer.time==null?null:peer.time/1000,peer.loss,peerRack],colors.muted),
        bar('Opponent',[avg(model.finished.map(m=>m.final_bot_score)),null,null,botTime==null?null:botTime/1000,null,null],colors.yellow)
      ]);
    }
  }
  function renderHeatmap() {
    const snapshot=state.liveRow?.board_snapshot || [...state.turns].reverse().find(t=>Array.isArray(t.raw?.boardSnapshotAfter))?.raw.boardSnapshotAfter;
    if(!Array.isArray(snapshot)){$('deep-heatmap').innerHTML='<p class="empty">ยังไม่มี Board Snapshot</p>';return;}
    let html='';
    for(let r=0;r<15;r++)for(let c=0;c<15;c++) {
      let density=0;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(snapshot[r+dr]?.[c+dc])density++;
      const level=density===0?0:density<=2?1:density<=4?2:density<=6?3:4;
      html+=`<span class="deep-heat-cell level-${level}" title="${String.fromCharCode(65+r)}${c+1}: ${density}"></span>`;
    }
    $('deep-heatmap').innerHTML=html;
  }
  function renderPhases() {
    const phases=state.analytics?.student?.phases;
    if (!phases) {
      $('deep-phase-analysis').innerHTML='<p class="empty">ยังไม่มีข้อมูล Phase Analysis</p>';
      return;
    }
    const groups=[phases.opening,phases.midgame,phases.endgame];
    const rows=[
      ['Win %','winRate',colors.green,100,'%'],
      ['Score / turn','scorePerTurn',colors.blue,20,''],
      ['DQ','dq',colors.blue,100,''],
      ['Avg Time (s)','avgTimeMs',colors.purple,60000,''],
      ['Tactical Loss','tacticalLoss',colors.red,20,'']
    ];
    const phaseLabels=phases.source==='bag-ratio'
      ? ['Opening<br>Bag > 65%','Midgame<br>Bag 25–65%','Endgame<br>Bag < 25%']
      : ['Opening<br>(1–10)','Midgame<br>(11–20)','Endgame<br>(21+)'];
    $('deep-phase-analysis').innerHTML=`<table class="deep-phase-table"><thead><tr><th>Metric</th>${phaseLabels.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(([name,key,color,max,suffix])=>`<tr><td>${name}</td>${groups.map(g=>{let v=g[key];if(key==='avgTimeMs'&&v!=null)v=v/1000;const meterV=key==='avgTimeMs'&&g[key]!=null?g[key]:v;return `<td><div class="deep-phase-cell"><span class="deep-phase-meter" style="--phase-color:${color}"><i style="width:${meterV==null?0:clamp(meterV/max*100)}%"></i></span>${format(v,1,suffix)}</div></td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function renderCritical() {
    const filter=$('deep-critical-filter').value;
    const base=state.analytics?.student?.criticalMoves || [];
    const turns=base.filter(t=>{
      const reasons=t.analytics_reasons || [];
      if(filter==='loss')return reasons.includes('High Tactical Loss');
      if(filter==='time')return reasons.includes('Slow Decision');
      if(filter==='dq')return reasons.includes('Low Decision Quality');
      return true;
    }).slice(0,8);
    $('student-turn-analysis').innerHTML=turns.length?`<table><thead><tr><th>Turn</th><th>Move</th><th>Score</th><th>DQ</th><th>Loss</th><th>Comment</th></tr></thead><tbody>${turns.map(t=>`<tr><td>${esc(t.turn_number)}</td><td><button data-deep-replay="${esc(t.id)}" data-match="${esc(t.match_id)}" title="Open replay: ${esc(t.equation)}">${esc(t.equation || t.event_type)}</button></td><td class="good">${format(t.move_score)}</td><td>${format(t.decision_quality)}</td><td class="bad">${format(t.tactical_loss,1)}</td><td title="${esc((t.analytics_reasons||[]).join(', '))}">${esc((t.analytics_reasons||[])[0] || 'Critical Move')}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">ยังไม่พบตาที่เข้าเกณฑ์วิเคราะห์</p>';
    $('student-turn-analysis').querySelectorAll('[data-deep-replay]').forEach(b=>b.addEventListener('click',()=>state.onReplay(b.dataset.match,b.dataset.deepReplay)));
  }

  function renderInsights() {
    const m=state.model,peer=state.peerModel,insights=[];
    if(m.time!=null)insights.push(['Decision pace',`เวลาเฉลี่ย ${(m.time/1000).toFixed(1)} วินาทีต่อตา${peer.time==null?'':` · ชั้นเรียน ${(peer.time/1000).toFixed(1)} วินาที`} ลองเตรียมสมการสำรองระหว่างรอคู่แข่ง`,colors.blue]);
    if(m.loss!=null)insights.push(['Reduce tactical loss',`เสียโอกาสเฉลี่ย ${m.loss.toFixed(1)} คะแนน ลองย้อนดูตาที่มี Loss สูงใน Critical Moves`,colors.red]);
    if(m.dq!=null)insights.push(['Decision quality',`DQ เฉลี่ย ${Math.round(m.dq)}/100 เปรียบเทียบตัวเลือกก่อนส่งคำตอบและตรวจ Replay เพื่อฝึกตัดสินใจ`,colors.yellow]);
    if(num(state.liveRow?.rack_quality)!=null)insights.push(['Rack balance',`คุณภาพแร็คปัจจุบัน ${Math.round(state.liveRow.rack_quality)}/100 วางแผนใช้ตัวเลขและเครื่องหมายให้สมดุล`,colors.green]);
    $('deep-insights').innerHTML=insights.length?insights.slice(0,4).map(([title,text,color],i)=>`<div class="deep-insight" style="--insight-color:${color}"><span>${i+1}</span><div><strong>${title}</strong><p>${text}</p></div></div>`).join(''):'<p class="empty">คำแนะนำจะแสดงเมื่อมีข้อมูลการเล่น</p>';
  }
  function renderLog() {
    $('student-match-history').innerHTML=state.studentMatches.length?[...state.studentMatches].reverse().slice(0,30).map(m=>`<button class="match-row" data-deep-match="${esc(m.id)}" type="button"><span><strong>${m.started_at?new Date(m.started_at).toLocaleDateString('th-TH'):'—'}</strong><small>${esc(m.ruleset_label || m.ruleset_id || 'A-Math')} · ${esc(m.difficulty || '—')}</small></span><span>${esc(m.result || m.status)}</span><span>${format(m.final_player_score)} – ${format(m.final_bot_score)}</span><span>Open Replay →</span></button>`).join(''):'<p class="empty">ยังไม่มีประวัติการแข่งขัน</p>';
    $('student-match-history').querySelectorAll('[data-deep-match]').forEach(b=>b.addEventListener('click',()=>state.onReplay(b.dataset.deepMatch)));
  }
  function render(data) {
    state=data;
    if (typeof AMATH_ANALYTICS !== "undefined") {
      state.analytics=AMATH_ANALYTICS.calculateStudentMetrics(data);
      state.model=state.analytics.student;
      state.peerModel=state.analytics.classAverage;
    } else {
      state.model=summarize(data.studentMatches,data.turns);
      state.peerModel=summarize(data.peerMatches,data.peerTurns);
    }
    if(state.peerModel.dq==null)state.peerModel.dq=avg(state.peerModel.finished.map(m=>m.summary?.avgDecisionQuality));
    if(state.peerModel.loss==null)state.peerModel.loss=avg(state.peerModel.finished.map(m=>m.summary?.avgTacticalLoss));
    renderHeader(state.model);renderCharts();renderHeatmap();renderPhases();renderCritical();renderInsights();renderLog();
  }
  function begin() {
    state=null;Object.values(charts).forEach(c=>c.destroy());charts={};
    for(const id of ['deep-phase-analysis','deep-insights','student-turn-analysis','student-match-history','deep-heatmap'])$(id).innerHTML='<p class="empty">กำลังโหลดข้อมูล...</p>';
    for(const id of ['deep-dq-badge','deep-time-badge','deep-loss-badge','deep-header-ruleset','deep-header-level'])$(id).textContent='—';
    $('deep-match-log').hidden=true;$('deep-match-log-toggle').setAttribute('aria-expanded','false');
    document.querySelectorAll('[data-deep-target]').forEach(b=>b.classList.toggle('active',b.dataset.deepTarget==='deep-summary'));
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('deep-trend-metric').addEventListener('change',()=>{if(state)renderCharts()});
    $('deep-turn-range').addEventListener('change',()=>{if(state)renderCharts()});
    $('deep-critical-filter').addEventListener('change',()=>{if(state)renderCritical()});
    $('deep-refresh').addEventListener('click',()=>{if(state)state.onReload()});
    document.querySelectorAll('[data-deep-target]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.deep-sidebar nav button').forEach(x=>x.classList.toggle('active',x===b));$(b.dataset.deepTarget)?.scrollIntoView({behavior:'smooth',block:'center'});}));
    const toggleLog=open=>{$('deep-match-log').hidden=!open;$('deep-match-log-toggle').setAttribute('aria-expanded',String(open));if(open)$('deep-match-log').scrollIntoView({behavior:'smooth',block:'start'});};
    $('deep-match-log-toggle').addEventListener('click',()=>toggleLog($('deep-match-log').hidden));
    $('deep-match-log-close').addEventListener('click',()=>toggleLog(false));
    const tick=()=>{const now=new Date();$('deep-clock').textContent=now.toLocaleTimeString('th-TH');$('deep-date').textContent=now.toLocaleDateString('th-TH',{weekday:'short',day:'numeric',month:'short',year:'numeric'});};
    tick();setInterval(tick,1000);
  });
  window.AMATH_DEEP_ANALYSIS={render,summarize,begin};
})();
