/* A-Math Analytics Core 1.6
 * Pure calculations only. UI code should consume this layer instead of reimplementing formulas.
 */
(() => {
  const n = v => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  const avg = values => {
    const xs = (values || []).map(n).filter(v => v != null);
    return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  };
  const clamp = (v,min=0,max=100) => v == null ? null : Math.max(min,Math.min(max,v));
  const playerMoves = turns => (turns || []).filter(t =>
    t.actor === "player" && (t.event_type || "move") === "move" && Number(t.turn_number) > 0
  );
  const botMoves = turns => (turns || []).filter(t =>
    t.actor === "bot" && (t.event_type || "move") === "move" && Number(t.turn_number) > 0
  );
  const finishedMatches = matches => (matches || []).filter(m => m.status === "finished");

  function summarize(matches=[],turns=[],liveRow=null) {
    const finished = finishedMatches(matches);
    const player = playerMoves(turns);
    const bot = botMoves(turns);
    const scoreAvg = avg(finished.map(m=>m.final_player_score)) ?? n(liveRow?.player_score);
    const botScoreAvg = avg(finished.map(m=>m.final_bot_score)) ?? n(liveRow?.bot_score);
    const wins = finished.filter(m=>m.result==="win").length;
    const losses = finished.filter(m=>m.result==="loss").length;
    const dq = avg(player.map(t=>t.decision_quality)) ?? avg(finished.map(m=>m.summary?.avgDecisionQuality));
    const loss = avg(player.map(t=>t.tactical_loss)) ?? avg(finished.map(m=>m.summary?.avgTacticalLoss));
    const timeMs = avg(player.map(t=>t.decision_time_ms)) ?? avg(finished.map(m=>m.summary?.avgDecisionTimeMs));
    const moveScoreAvg = avg(player.map(t=>t.move_score));
    const botMoveScoreAvg = avg(bot.map(t=>t.move_score));
    return {
      player,bot,finished,
      games:finished.length,
      score:scoreAvg,
      opponentScore:botScoreAvg,
      win:finished.length ? wins/finished.length*100 : null,
      opponentWin:finished.length ? losses/finished.length*100 : null,
      dq,loss,time:timeMs,
      moveScore:moveScoreAvg,
      opponentMoveScore:botMoveScoreAvg,
      rackQuality:n(liveRow?.rack_quality),
      pressure:n(liveRow?.pressure_level),
      risk:player.at(-1)?.threat_before ?? null,
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
      tacticalLoss:avg(ts.map(t=>t.tactical_loss)),
      rackQuality:avg(ts.map(t=>t.raw?.rackQuality ?? t.raw?.rack_quality)),
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
      tacticalControl:summary.loss == null ? null : clamp(100-summary.loss*5),
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
        score:true,win:false,dq:false,time:true,tacticalLoss:false,rackQuality:false
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
    return (turns || [])
      .filter(t => (t.event_type || "move") === "move" && t.actor === actor && Number(t.turn_number)>0)
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
        else if(metric==="loss") value=n(t.tactical_loss);
        if(!groups.has(Number(t.turn_number))) groups.set(Number(t.turn_number),[]);
        groups.get(Number(t.turn_number)).push(value);
      }
    }
    return groups;
  }

  function calculateTrendSeries(turns=[],peerTurns=[]) {
    const lastMatchId=(turns || []).at(-1)?.match_id || null;
    const matchTurns=lastMatchId ? turns.filter(t=>t.match_id===lastMatchId) : [];
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
        student:player.map(t=>n(t.tactical_loss)),
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
      trends:calculateTrendSeries(data.turns||[],data.peerTurns||[]),
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
    cumulativeSeries,
    phaseOf,
  };
})();