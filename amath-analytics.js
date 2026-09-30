/* A-Math Analytics Core 1.8 — AMATS Analytics v2
 * Pure calculations only. UI/game telemetry consume the same formulas.
 * Scores below are heuristic game analytics, not psychometric or diagnostic measures.
 */
(() => {
  const n = v => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  const avg = values => {
    const xs = (values || []).map(n).filter(v => v != null);
    return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  };
  const clamp = (v,min=0,max=100) => v == null ? null : Math.max(min,Math.min(max,v));
  function normalizeTurns(turns=[]) {
    const counters=new Map();
    return (turns || []).map(t=>{
      if((t.event_type || "move") !== "move") return t;
      const key=`${t.match_id || "unknown"}|${t.actor || "unknown"}`;
      const next=(counters.get(key)||0)+1;
      counters.set(key,next);
      const turnNo=Number(t.turn_number);
      return Number.isFinite(turnNo) && turnNo>0 ? t : {...t,turn_number:next,_turn_number_fallback:true};
    });
  }

  const playerMoves = turns => normalizeTurns(turns).filter(t =>
    t.actor === "player" && (t.event_type || "move") === "move"
  ).map(enrichPlayerTurn);
  const botMoves = turns => (turns || []).filter(t =>
    t.actor === "bot" && (t.event_type || "move") === "move" && Number(t.turn_number) > 0
  );
  const finishedMatches = matches => (matches || []).filter(m => m.status === "finished");
  const ANALYTICS_VERSION = "AMATS_ANALYTICS_V2";

  function calculateTacticalLoss({chosenValue,bestValue,tacticalLoss}={}) {
    const chosen=n(chosenValue), best=n(bestValue);
    const points=n(tacticalLoss) ?? (chosen!=null && best!=null ? Math.max(0,best-chosen) : null);
    if(points==null) return {points:null,rate:null,scale:null};
    const scale=clamp((Math.abs(best ?? chosen ?? 0)*0.35)+8,10,30);
    const rate=Math.round(clamp(100*(1-Math.exp(-Math.max(0,points)/scale)))*10)/10;
    return {points:Math.round(Math.max(0,points)*10)/10,rate,scale:Math.round(scale*10)/10};
  }

  function calculateDecisionQuality(input={}) {
    const loss=calculateTacticalLoss(input);
    return loss.rate==null ? null : Math.round((100-loss.rate)*10)/10;
  }

  function calculateRackQualityFromPct(value) {
    return n(value)==null ? null : Math.round(clamp(Number(value))*10)/10;
  }

  function calculatePressure({gapPoints,playerTimeMs,initialTimeMs,bagCount,bagSize}={}) {
    const components=[];
    const gap=n(gapPoints);
    if(gap!=null) components.push({w:.30,v:clamp(100-(Math.abs(gap)/50)*100)});
    const remain=n(playerTimeMs), initial=n(initialTimeMs);
    if(remain!=null && initial!=null && initial>0) components.push({w:.45,v:clamp((1-remain/initial)*100)});
    const bag=n(bagCount), total=n(bagSize);
    if(bag!=null && total!=null && total>0) components.push({w:.25,v:clamp((1-bag/total)*100)});
    if(!components.length) return null;
    const w=components.reduce((s,x)=>s+x.w,0);
    return Math.round((components.reduce((s,x)=>s+x.v*x.w,0)/w)*10)/10;
  }

  function calculateRisk({threatPct,opponentOpportunity}={}) {
    const parts=[];
    const threat=n(threatPct);
    if(threat!=null) parts.push({w:.65,v:clamp(threat)});
    const exposure=n(opponentOpportunity);
    if(exposure!=null) parts.push({w:.35,v:clamp(exposure/6*100)});
    if(!parts.length) return null;
    const w=parts.reduce((s,x)=>s+x.w,0);
    return Math.round((parts.reduce((s,x)=>s+x.v*x.w,0)/w)*10)/10;
  }

  function enrichPlayerTurn(t) {
    if(!t || t.actor!=="player") return t;
    const raw=t.raw || {};
    const moveValue=n(t.move_value) ?? n(raw.moveValue);
    const bestMoveValue=n(t.best_move_value) ?? n(raw.bestMoveValue);
    const tacticalLoss=n(t.tactical_loss) ?? n(raw.tacticalLoss) ??
      (bestMoveValue!=null && moveValue!=null ? Math.max(0,bestMoveValue-moveValue) : null);
    const lossV2=calculateTacticalLoss({chosenValue:moveValue,bestValue:bestMoveValue,tacticalLoss});
    const lossRate=n(raw.tacticalLossPctV2) ?? lossV2.rate;
    const dq=n(raw.decisionQualityV2) ?? n(t.decision_quality) ??
      (lossRate==null ? null : Math.round((100-lossRate)*10)/10);
    const rackQuality=n(raw.rackQualityAfter ?? raw.rackQuality ?? raw.rack_quality);
    const pressure=n(raw.pressureV2 ?? raw.pressure_level);
    const risk=n(raw.riskV2 ?? raw.risk);
    return {
      ...t,
      decision_time_ms:n(t.decision_time_ms) ?? n(raw.decisionTimeMs),
      move_value:moveValue,
      best_move_value:bestMoveValue,
      tactical_loss:tacticalLoss,
      decision_quality:dq,
      suggested_mode:t.suggested_mode ?? raw.suggestedMode ?? null,
      threat_before:t.threat_before ?? raw.threatBefore ?? null,
      _v2:{tacticalLossRate:lossRate,rackQuality,pressure,risk,version:raw.analyticsVersion || null}
    };
  }


  function summarize(matches=[],turns=[],liveRow=null) {
    const finished = finishedMatches(matches);
    const player = playerMoves(turns);
    const bot = botMoves(turns);
    const scoreAvg = avg(finished.map(m=>m.final_player_score)) ?? n(liveRow?.player_score);
    const botScoreAvg = avg(finished.map(m=>m.final_bot_score)) ?? n(liveRow?.bot_score);
    const wins = finished.filter(m=>m.result==="win").length;
    const losses = finished.filter(m=>m.result==="loss").length;
    const dq = avg(player.map(t=>t.decision_quality)) ?? avg(finished.map(m=>m.summary?.avgDecisionQuality));
    const lossPoints = avg(player.map(t=>t.tactical_loss)) ?? avg(finished.map(m=>m.summary?.avgTacticalLoss));
    const loss = avg(player.map(t=>t._v2?.tacticalLossRate)) ?? avg(finished.map(m=>m.summary?.avgTacticalLossPctV2));
    const timeMs = avg(player.map(t=>t.decision_time_ms)) ?? avg(finished.map(m=>m.summary?.avgDecisionTimeMs));
    const moveScoreAvg = avg(player.map(t=>t.move_score)) ?? avg(finished.map(m=>m.summary?.avgScore));
    const botMoveScoreAvg = avg(bot.map(t=>t.move_score));
    return {
      player,bot,finished,
      games:finished.length,
      score:scoreAvg,
      opponentScore:botScoreAvg,
      win:finished.length ? wins/finished.length*100 : null,
      opponentWin:finished.length ? losses/finished.length*100 : null,
      dq,loss,lossPoints,time:timeMs,
      moveScore:moveScoreAvg,
      opponentMoveScore:botMoveScoreAvg,
      rackQuality:avg(player.map(t=>t._v2?.rackQuality)) ?? n(liveRow?.rack_quality) ?? avg(finished.map(m=>m.summary?.avgRackQuality)),
      pressure:avg(player.map(t=>t._v2?.pressure)) ?? n(liveRow?.pressure_level) ?? avg(finished.map(m=>m.summary?.avgPressure)),
      risk:avg(player.map(t=>t._v2?.risk)) ?? n(liveRow?.risk_level) ?? avg(finished.map(m=>m.summary?.avgRisk)),
      lastMoveScore:n(liveRow?.last_move_score) ?? n(player.at(-1)?.move_score),
    };
  }

  function rulesetSize(match) {
    if (match?.ruleset_id === "PRIMARY_70") return 70;
    return 100;
  }

  function phaseOf(turn,match=null) {
    const raw = turn?.raw || {};
    const bag = n(raw.bagCount ?? raw.bag_count ?? turn?.bag_count);
    if (bag != null) {
      const ratio = bag / rulesetSize(match) * 100;
      if (ratio > 65) return "opening";
      if (ratio > 25) return "midgame";
      return "endgame";
    }
    // Historical telemetry before 1.6 did not record bag count.
    const t = Number(turn?.turn_number) || 0;
    if (t <= 10) return "opening";
    if (t <= 20) return "midgame";
    return "endgame";
  }

  function metricBlock(turns,matches=[]) {
    const ts = playerMoves(turns);
    const ids = new Set(ts.map(t=>t.match_id));
    const games = finishedMatches(matches).filter(m=>ids.has(m.id));
    return {
      turns:ts.length,
      scorePerTurn:avg(ts.map(t=>t.move_score)),
      dq:avg(ts.map(t=>t.decision_quality)),
      avgTimeMs:avg(ts.map(t=>t.decision_time_ms)),
      tacticalLoss:avg(ts.map(t=>t._v2?.tacticalLossRate)),
      tacticalLossPoints:avg(ts.map(t=>t.tactical_loss)),
      rackQuality:avg(ts.map(t=>t._v2?.rackQuality ?? t.raw?.rackQualityAfter ?? t.raw?.rackQuality ?? t.raw?.rack_quality)),
      pressure:avg(ts.map(t=>t._v2?.pressure)),
      risk:avg(ts.map(t=>t._v2?.risk)),
      winRate:games.length ? games.filter(m=>m.result==="win").length/games.length*100 : null,
    };
  }

  function calculatePhaseMetrics(turns=[],matches=[]) {
    const matchMap = new Map((matches || []).map(m=>[m.id,m]));
    const buckets = {opening:[],midgame:[],endgame:[]};
    for (const t of playerMoves(turns)) {
      buckets[phaseOf(t,matchMap.get(t.match_id))].push(t);
    }
    const source = playerMoves(turns).some(t => n(t.raw?.bagCount ?? t.raw?.bag_count ?? t.bag_count) != null)
      ? "bag-ratio" : "turn-fallback";
    return {
      source,
      opening:metricBlock(buckets.opening,matches),
      midgame:metricBlock(buckets.midgame,matches),
      endgame:metricBlock(buckets.endgame,matches),
    };
  }

  function criticalReason(t) {
    const reasons=[];
    if (n(t.tactical_loss) != null && Number(t.tactical_loss) >= 5) reasons.push("High Tactical Loss");
    if (n(t.decision_quality) != null && Number(t.decision_quality) < 60) reasons.push("Low Decision Quality");
    if (n(t.decision_time_ms) != null && Number(t.decision_time_ms) >= 45000) reasons.push("Slow Decision");
    if (n(t.move_score) != null && Number(t.move_score) >= 20) reasons.push("High-value Move");
    if (n(t.gap_before) != null && n(t.gap_after) != null && Math.abs(Number(t.gap_after)-Number(t.gap_before)) >= 15) reasons.push("Large Score Swing");
    return reasons;
  }

  function calculateCriticalMoves(turns=[]) {
    return playerMoves(turns)
      .map(t=>({...t,analytics_reasons:criticalReason(t)}))
      .filter(t=>t.analytics_reasons.length)
      .sort((a,b)=>{
        const la=n(b.tactical_loss)||0, lb=n(a.tactical_loss)||0;
        if (la!==lb) return la-lb;
        return (n(a.decision_quality)??101)-(n(b.decision_quality)??101);
      });
  }

  function speedScore(avgTimeMs) {
    if (avgTimeMs == null) return null;
    // 0 sec => 100, 60+ sec => 0. This is a display normalization, not a psychometric score.
    return clamp(100 - avgTimeMs/600);
  }

  function calculatePlayerProfile(summary) {
    return {
      decisionQuality:clamp(summary.dq),
      scoring:summary.moveScore == null ? null : clamp(summary.moveScore/20*100),
      speed:speedScore(summary.time),
      rackManagement:clamp(summary.rackQuality),
      tacticalControl:summary.loss == null ? null : clamp(100-summary.loss),
    };
  }

  function calculateBenchmark(studentSummary,classSummary,turns=[]) {
    const bot = botMoves(turns);
    return {
      labels:["Score Avg","Win %","DQ","Avg Time (s)","Tactical Loss","Rack Quality"],
      student:[
        studentSummary.score,studentSummary.win,studentSummary.dq,
        studentSummary.time==null?null:studentSummary.time/1000,
        studentSummary.loss,studentSummary.rackQuality
      ],
      classAverage:[
        classSummary.score,classSummary.win,classSummary.dq,
        classSummary.time==null?null:classSummary.time/1000,
        classSummary.loss,classSummary.rackQuality
      ],
      opponent:[
        studentSummary.opponentScore,
        studentSummary.opponentWin,
        null,
        avg(bot.map(t=>t.decision_time_ms)) == null ? null : avg(bot.map(t=>t.decision_time_ms))/1000,
        null,
        null
      ],
      opponentComparable:{
        score:true,win:true,dq:false,time:true,tacticalLoss:false,rackQuality:false
      }
    };
  }

  function calculateMatchMetrics(matches=[],turns=[],liveRow=null) {
    const summary=summarize(matches,turns,liveRow);
    return {
      ...summary,
      profile:calculatePlayerProfile(summary),
      phases:calculatePhaseMetrics(turns,matches),
      criticalMoves:calculateCriticalMoves(turns),
    };
  }

  function cumulativeSeries(turns=[],actor="player") {
    let score=0;
    return normalizeTurns(turns)
      .filter(t => (t.event_type || "move") === "move" && t.actor === actor)
      .map(t => ({ turn:Number(t.turn_number), value:score += Number(t.move_score)||0 }));
  }

  function peerMetricByTurn(peerTurns=[],metric="dq") {
    const groups=new Map();
    const byMatch=new Map();
    for(const t of peerTurns || []) {
      if(!byMatch.has(t.match_id)) byMatch.set(t.match_id,[]);
      byMatch.get(t.match_id).push(t);
    }
    for(const turns of byMatch.values()) {
      let score=0;
      for(const t of playerMoves(turns)) {
        score += Number(t.move_score)||0;
        let value=null;
        if(metric==="score") value=score;
        else if(metric==="dq") value=n(t.decision_quality);
        else if(metric==="time") value=n(t.decision_time_ms)==null?null:Number(t.decision_time_ms)/1000;
        else if(metric==="loss") value=n(t._v2?.tacticalLossRate);
        if(!groups.has(Number(t.turn_number))) groups.set(Number(t.turn_number),[]);
        groups.get(Number(t.turn_number)).push(value);
      }
    }
    return groups;
  }

  function calculateTrendSeries(turns=[],peerTurns=[],preferredMatchId=null,matches=[],peerMatches=[]) {
    const normalized=normalizeTurns(turns);
    const byMatch=new Map();
    for(const t of normalized){
      if(!t.match_id) continue;
      if(!byMatch.has(t.match_id)) byMatch.set(t.match_id,[]);
      byMatch.get(t.match_id).push(t);
    }
    const hasPlayerMoves=id => playerMoves(byMatch.get(id)||[]).length>0;
    let lastMatchId=preferredMatchId && hasPlayerMoves(preferredMatchId) ? preferredMatchId : null;
    if(!lastMatchId){
      const candidateIds=[...byMatch.keys()].filter(hasPlayerMoves);
      candidateIds.sort((a,b)=>{
        const ta=Math.max(...(byMatch.get(a)||[]).map(t=>new Date(t.occurred_at || t.raw?.ts || 0).getTime()||0));
        const tb=Math.max(...(byMatch.get(b)||[]).map(t=>new Date(t.occurred_at || t.raw?.ts || 0).getTime()||0));
        return tb-ta;
      });
      lastMatchId=candidateIds[0] || null;
    }

    if(!lastMatchId){
      const history=finishedMatches(matches).slice().sort((a,b)=>new Date(a.started_at||0)-new Date(b.started_at||0));
      const peer=finishedMatches(peerMatches);
      const peerScore=avg(peer.map(m=>m.final_player_score));
      const peerDQ=avg(peer.map(m=>m.summary?.avgDecisionQuality));
      const peerTime=avg(peer.map(m=>m.summary?.avgDecisionTimeMs));
      const peerLoss=avg(peer.map(m=>m.summary?.avgTacticalLossPctV2 ?? m.summary?.avgTacticalLoss));
      return {
        matchId:null,
        source:history.length ? "match-history" : "no-turn-data",
        axis:"game",
        labels:history.map((_,i)=>i+1),
        score:{
          student:history.map(m=>n(m.final_player_score)),
          opponent:history.map(m=>n(m.final_bot_score)),
          classAverage:history.map(()=>peerScore),
        },
        dq:{
          student:history.map(m=>n(m.summary?.avgDecisionQuality)),
          classAverage:history.map(()=>peerDQ),
        },
        time:{
          student:history.map(m=>n(m.summary?.avgDecisionTimeMs)==null?null:Number(m.summary.avgDecisionTimeMs)/1000),
          classAverage:history.map(()=>peerTime==null?null:peerTime/1000),
        },
        loss:{
          student:history.map(m=>n(m.summary?.avgTacticalLossPctV2 ?? m.summary?.avgTacticalLoss)),
          classAverage:history.map(()=>peerLoss),
        },
      };
    }

    const matchTurns=byMatch.get(lastMatchId)||[];
    const player=playerMoves(matchTurns);
    const labels=player.map(t=>Number(t.turn_number));
    const playerScoreMap=new Map(cumulativeSeries(matchTurns,"player").map(x=>[x.turn,x.value]));
    const botScoreSeries=cumulativeSeries(matchTurns,"bot");
    const peerScore=peerMetricByTurn(peerTurns,"score");
    const peerDQ=peerMetricByTurn(peerTurns,"dq");
    const peerTime=peerMetricByTurn(peerTurns,"time");
    const peerLoss=peerMetricByTurn(peerTurns,"loss");
    return {
      matchId:lastMatchId,
      source:lastMatchId === preferredMatchId ? "active-match" : "latest-player-match",
      axis:"turn",
      labels,
      score:{
        student:labels.map(turn=>playerScoreMap.get(turn) ?? null),
        opponent:labels.map(turn=>botScoreSeries.filter(x=>x.turn<=turn).at(-1)?.value ?? 0),
        classAverage:labels.map(turn=>avg(peerScore.get(turn)||[])),
      },
      dq:{
        student:player.map(t=>n(t.decision_quality)),
        classAverage:labels.map(turn=>avg(peerDQ.get(turn)||[])),
      },
      time:{
        student:player.map(t=>n(t.decision_time_ms)==null?null:Number(t.decision_time_ms)/1000),
        classAverage:labels.map(turn=>avg(peerTime.get(turn)||[])),
      },
      loss:{
        student:player.map(t=>n(t._v2?.tacticalLossRate)),
        classAverage:labels.map(turn=>avg(peerLoss.get(turn)||[])),
      },
    };
  }

  function calculateStudentMetrics(data) {
    const student=calculateMatchMetrics(data.studentMatches||[],data.turns||[],data.liveRow||null);
    const classAverage=calculateMatchMetrics(data.peerMatches||[],data.peerTurns||[],{
      rack_quality:avg((data.peerLiveRows||[]).map(r=>r.rack_quality)),
      pressure_level:avg((data.peerLiveRows||[]).map(r=>r.pressure_level)),
    });
    return {
      student,
      classAverage,
      benchmark:calculateBenchmark(student,classAverage,data.turns||[]),
      trends:calculateTrendSeries(data.turns||[],data.peerTurns||[],data.liveRow?.match_id || null,data.studentMatches||[],data.peerMatches||[]),
      phaseSource:student.phases.source,
      generatedAt:new Date().toISOString(),
    };
  }

  window.AMATH_ANALYTICS={
    avg,clamp,playerMoves,botMoves,
    summarize,
    calculateMatchMetrics,
    calculateStudentMetrics,
    calculatePhaseMetrics,
    calculateCriticalMoves,
    calculatePlayerProfile,
    calculateBenchmark,
    calculateTrendSeries,
    calculateDecisionQuality,
    calculateTacticalLoss,
    calculateRackQualityFromPct,
    calculatePressure,
    calculateRisk,
    enrichPlayerTurn,
    ANALYTICS_VERSION,
    cumulativeSeries,
    normalizeTurns,
    phaseOf,
  };
})();