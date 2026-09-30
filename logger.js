/* AMATS — Turn Data Logger: บันทึกทุกตาแบบมีโครงสร้าง (อิงข้อ 7 ของแผนโครงการ) + สรุปหลังจบเกม */
const AMATS_LOGGER = (() => {
  const STORAGE_KEY = "amats_game_matches_v1";
  const MAX_STORED_MATCHES = 30;

  let currentMatch = null;
  let turnStartedAt = null;

  function startMatch({
    opponentType, difficulty, rulesetId = null, rulesetLabel = null,
    studentUserId = null, studentCode = null, studentName = null,
    className = null, roomNo = null,
  }) {
    currentMatch = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      opponentType, difficulty, rulesetId, rulesetLabel,
      studentUserId, studentCode, studentName, className, roomNo,
      startedAt: Date.now(),
      finishedAt: null,
      result: null,
      finalPlayerScore: null,
      finalBotScore: null,
      turns: [],
    };
    turnStartedAt = Date.now();
    if (typeof AMATH_SUPABASE_TELEMETRY !== "undefined") {
      AMATH_SUPABASE_TELEMETRY.startMatch(currentMatch);
    }
    return currentMatch;
  }

  function markTurnStart() { turnStartedAt = Date.now(); }

  function compactBoard(board) {
    if (!Array.isArray(board)) return null;
    return board.map(row => row.map(cell => cell ? {
      c: cell.resolvedChar ?? cell.face ?? null,
      p: cell.points ?? 0,
      k: cell.kind ?? null,
      f: cell.face ?? null,
    } : null));
  }

  function boardAfterCandidate(board, candidate) {
    const snap = compactBoard(board);
    if (!snap || !candidate?.coords) return snap;
    candidate.coords.forEach(({ r, c }, i) => {
      const tile = candidate.tiles?.[i];
      snap[r][c] = tile ? {
        c: tile.resolvedChar ?? tile.face ?? null,
        p: tile.points ?? 0,
        k: tile.kind ?? null,
        f: tile.face ?? null,
      } : snap[r][c];
    });
    return snap;
  }

  /**
   * บันทึกตาของผู้เล่น (ไม่ใช่ของบอท) — เก็บครบตามข้อ 7 ของแผนโครงการ
   * ctx: { board, rack (ก่อนเดิน), playerScore (ก่อนเดิน), botScore, turnNumber, isFirstMove, candidate, moveResult }
   */
  function logPlayerTurn(ctx) {
    if (!currentMatch) return null;
    const { board, rackBefore, playerScoreBefore, botScoreBefore, turnNumber, isFirstMove, candidate, moveResult, opponentDifficulty, bagCount, bagSize, playerTimeMs, initialTimeMs } = ctx;

    const gapBefore = AMATS_BRIDGE.gapFromScores(playerScoreBefore, botScoreBefore);
    const before = AMATS_BRIDGE.analyze({ board, myScore: playerScoreBefore, oppScore: botScoreBefore, turnNumber, rack: rackBefore, opponentDifficulty });

    const rackAfter = AMATH_GAME_BOT.rackAfterMove(rackBefore, candidate);
    const playerScoreAfter = playerScoreBefore + moveResult.score;
    const gapAfter = AMATS_BRIDGE.gapFromScores(playerScoreAfter, botScoreBefore);

    const chosenMV = AMATS_MOVE_ANALYSIS.computeMoveValue(board, candidate, rackBefore);
    const best = AMATS_MOVE_ANALYSIS.findBestMoveValue(board, rackBefore, isFirstMove);
    const bestValue = best ? Math.max(best.value, chosenMV.value) : chosenMV.value;
    const tacticalLoss = Math.max(0, bestValue - chosenMV.value);
    const tacticalLossV2 = typeof AMATH_ANALYTICS !== "undefined"
      ? AMATH_ANALYTICS.calculateTacticalLoss({ chosenValue: chosenMV.value, bestValue, tacticalLoss })
      : { points:tacticalLoss, rate:Math.max(0, Math.min(100, tacticalLoss / 20 * 100)), scale:20 };
    const decisionQuality = typeof AMATH_ANALYTICS !== "undefined"
      ? AMATH_ANALYTICS.calculateDecisionQuality({ chosenValue: chosenMV.value, bestValue, tacticalLoss })
      : Math.max(0, 100 - tacticalLossV2.rate);

    const rackBeforePct = before?.rackHealth?.pct ?? null;
    const rackAfterPct = AMATS_BRIDGE.rackHealth(rackAfter)?.pct ?? null;
    const gapPoints = playerScoreBefore - botScoreBefore;
    const pressureV2 = typeof AMATH_ANALYTICS !== "undefined"
      ? AMATH_ANALYTICS.calculatePressure({ gapPoints, playerTimeMs, initialTimeMs, bagCount, bagSize })
      : null;
    const riskV2 = typeof AMATH_ANALYTICS !== "undefined"
      ? AMATH_ANALYTICS.calculateRisk({ threatPct: before?.threatPct, opponentOpportunity: chosenMV.breakdown.opponentOpportunity })
      : null;

    const entry = {
      actor: "player",
      turnNumber,
      scoreBefore: playerScoreBefore, oppScoreBefore: botScoreBefore,
      gapBefore, gapAfter,
      rackBefore: rackBefore.map(t => t.kind === "blank" ? "?" : t.face),
      rackAfter: rackAfter.map(t => t.kind === "blank" ? "?" : t.face),
      boardState: before.board, threatBefore: before.threat,
      suggestedMode: before.recommendation ? before.recommendation.primary : null,
      equation: moveResult.equations.map(e => e.string).join(" & "),
      moveScore: moveResult.score,
      tilesUsed: candidate.coords.length,
      opponentOpportunity: chosenMV.breakdown.opponentOpportunity,
      opponentNextScore: null, // เติมย้อนหลังหลังบอทเดินตาถัดไป
      decisionTimeMs: turnStartedAt ? Date.now() - turnStartedAt : null,
      moveValue: Math.round(chosenMV.value * 10) / 10,
      bestMoveValue: Math.round(bestValue * 10) / 10,
      decisionQuality: Math.round(decisionQuality * 10) / 10,
      tacticalLoss: Math.round(tacticalLoss * 10) / 10,
      analyticsVersion: typeof AMATH_ANALYTICS !== "undefined" ? AMATH_ANALYTICS.ANALYTICS_VERSION : "LEGACY",
      decisionQualityV2: decisionQuality,
      tacticalLossPctV2: tacticalLossV2.rate,
      tacticalLossScaleV2: tacticalLossV2.scale,
      rackQualityBefore: rackBeforePct,
      rackQualityAfter: rackAfterPct,
      pressureV2,
      riskV2,
      threatPctBefore: before?.threatPct ?? null,
      bagCount: bagCount ?? null,
      boardSnapshotBefore: compactBoard(board),
      boardSnapshotAfter: boardAfterCandidate(board, candidate),
      placements: candidate.coords.map(({ r, c }, i) => ({
        r, c,
        char: candidate.tiles?.[i]?.resolvedChar ?? candidate.tiles?.[i]?.face ?? null,
        points: candidate.tiles?.[i]?.points ?? 0,
      })),
      ts: Date.now(),
    };
    currentMatch.turns.push(entry);
    if (typeof AMATH_SUPABASE_TELEMETRY !== "undefined") {
      AMATH_SUPABASE_TELEMETRY.logTurn(currentMatch, entry);
    }
    turnStartedAt = Date.now();
    return entry;
  }

  function logPlayerAction(eventType, turnNumber, details = {}) {
    if (!currentMatch) return null;
    const entry = {
      actor: "player",
      eventType,
      turnNumber,
      moveScore: details.moveScore ?? 0,
      equation: details.equation ?? null,
      decisionTimeMs: turnStartedAt ? Date.now() - turnStartedAt : null,
      ts: Date.now(),
      ...details,
      boardSnapshotBefore: details.board ? compactBoard(details.board) : (details.boardSnapshotBefore ?? null),
      boardSnapshotAfter: details.board ? compactBoard(details.board) : (details.boardSnapshotAfter ?? null),
    };
    delete entry.board;
    currentMatch.turns.push(entry);
    if (typeof AMATH_SUPABASE_TELEMETRY !== "undefined") {
      AMATH_SUPABASE_TELEMETRY.logTurn(currentMatch, entry);
    }
    turnStartedAt = Date.now();
    return entry;
  }

  function logBotTurn(turnNumber, score, details = {}) {
    if (!currentMatch) return;
    const botEntry = {
      actor: "bot",
      turnNumber,
      moveScore: score,
      eventType: details.eventType || "move",
      equation: details.equation || null,
      rackAfter: details.rackAfter || null,
      boardSnapshotAfter: details.board ? compactBoard(details.board) : (details.boardSnapshotAfter ?? null),
      placements: details.placements || null,
      bagCount: details.bagCount ?? null,
      ts: Date.now()
    };
    currentMatch.turns.push(botEntry);
    if (typeof AMATH_SUPABASE_TELEMETRY !== "undefined") {
      AMATH_SUPABASE_TELEMETRY.logTurn(currentMatch, botEntry);
    }
    // เติมคะแนนคู่แข่ง (บอท) ในตาถัดไป ย้อนกลับเข้าตาผู้เล่นล่าสุด
    for (let i = currentMatch.turns.length - 2; i >= 0; i--) {
      if (currentMatch.turns[i].actor === "player") { currentMatch.turns[i].opponentNextScore = score; break; }
    }
  }

  function finalizeMatch({ result, finalPlayerScore, finalBotScore, clock = null, endReason = null }) {
    if (!currentMatch) return null;
    currentMatch.finishedAt = Date.now();
    currentMatch.result = result;
    currentMatch.clock = clock;
    currentMatch.endReason = endReason;
    currentMatch.finalPlayerScore = finalPlayerScore;
    currentMatch.finalBotScore = finalBotScore;
    const summary = computeSummary(currentMatch);
    currentMatch.summary = summary;
    try {
      const all = loadAll();
      all.unshift(currentMatch);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_STORED_MATCHES)));
    } catch (e) { /* storage unavailable — session summary still returned below */ }
    const finished = currentMatch;
    if (typeof AMATH_SUPABASE_TELEMETRY !== "undefined") {
      AMATH_SUPABASE_TELEMETRY.finishMatch(finished);
    }
    currentMatch = null;
    return finished;
  }

  function computeSummary(match) {
    const playerTurns = match.turns.filter(t => t.actor === "player" && (t.eventType || "move") === "move");
    if (playerTurns.length === 0) return null;
    const nums = arr => arr.map(Number).filter(Number.isFinite);
    const avg = arr => { const xs=nums(arr); return xs.length ? xs.reduce((s,v)=>s+v,0)/xs.length : null; };
    const dqTurns = playerTurns.filter(t => Number.isFinite(Number(t.decisionQuality)));
    const sorted = [...dqTurns].sort((a,b) => Number(b.decisionQuality)-Number(a.decisionQuality));
    return {
      analyticsVersion: typeof AMATH_ANALYTICS !== "undefined" ? AMATH_ANALYTICS.ANALYTICS_VERSION : "LEGACY",
      turnsPlayed: playerTurns.length,
      avgScore: avg(playerTurns.map(t=>t.moveScore)),
      avgDecisionQuality: avg(playerTurns.map(t=>t.decisionQuality)),
      avgDecisionTimeMs: avg(playerTurns.map(t=>t.decisionTimeMs)),
      avgTacticalLoss: avg(playerTurns.map(t=>t.tacticalLoss)),
      avgTacticalLossPctV2: avg(playerTurns.map(t=>t.tacticalLossPctV2)),
      totalTacticalLoss: nums(playerTurns.map(t=>t.tacticalLoss)).reduce((s,v)=>s+v,0),
      avgRackQuality: avg(playerTurns.map(t=>t.rackQualityAfter)),
      avgPressure: avg(playerTurns.map(t=>t.pressureV2)),
      avgRisk: avg(playerTurns.map(t=>t.riskV2)),
      goodDecisionRate: dqTurns.length ? dqTurns.filter(t=>Number(t.decisionQuality)>=70).length/dqTurns.length*100 : null,
      bestDecisions: sorted.slice(0,3),
      worstDecisions: [...playerTurns].sort((a,b)=>(Number(b.tacticalLoss)||0)-(Number(a.tacticalLoss)||0)).slice(0,3).filter(t=>(Number(t.tacticalLoss)||0)>0),
      modeUsage: playerTurns.reduce((acc,t)=>{ if(t.suggestedMode) acc[t.suggestedMode]=(acc[t.suggestedMode]||0)+1; return acc; },{}),
    };
  }

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
  }

  function getCurrentMatch() { return currentMatch; }

  function resetLocalData() {
    currentMatch = null;
    turnStartedAt = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* storage unavailable */ }
  }

  return {
    startMatch, markTurnStart, logPlayerTurn, logPlayerAction, logBotTurn,
    finalizeMatch, computeSummary, loadAll, getCurrentMatch, resetLocalData
  };
})();
