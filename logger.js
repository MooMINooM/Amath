/* AMATS — Turn Data Logger: บันทึกทุกตาแบบมีโครงสร้าง (อิงข้อ 7 ของแผนโครงการ) + สรุปหลังจบเกม */
const AMATS_LOGGER = (() => {
  const STORAGE_KEY = "amats_game_matches_v1";
  const MAX_STORED_MATCHES = 30;

  let currentMatch = null;
  let turnStartedAt = null;

  function startMatch({ opponentType, difficulty }) {
    currentMatch = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      opponentType, difficulty,
      startedAt: Date.now(),
      finishedAt: null,
      result: null,
      finalPlayerScore: null,
      finalBotScore: null,
      turns: [],
    };
    turnStartedAt = Date.now();
    return currentMatch;
  }

  function markTurnStart() { turnStartedAt = Date.now(); }

  /**
   * บันทึกตาของผู้เล่น (ไม่ใช่ของบอท) — เก็บครบตามข้อ 7 ของแผนโครงการ
   * ctx: { board, rack (ก่อนเดิน), playerScore (ก่อนเดิน), botScore, turnNumber, isFirstMove, candidate, moveResult }
   */
  function logPlayerTurn(ctx) {
    if (!currentMatch) return null;
    const { board, rackBefore, playerScoreBefore, botScoreBefore, turnNumber, isFirstMove, candidate, moveResult } = ctx;

    const gapBefore = AMATS_BRIDGE.gapFromScores(playerScoreBefore, botScoreBefore);
    const before = AMATS_BRIDGE.analyze({ board, myScore: playerScoreBefore, oppScore: botScoreBefore, turnNumber, rack: rackBefore });

    const rackAfter = AMATH_GAME_BOT.rackAfterMove(rackBefore, candidate);
    const playerScoreAfter = playerScoreBefore + moveResult.score;
    const gapAfter = AMATS_BRIDGE.gapFromScores(playerScoreAfter, botScoreBefore);

    const chosenMV = AMATS_MOVE_ANALYSIS.computeMoveValue(board, candidate, rackBefore);
    const best = AMATS_MOVE_ANALYSIS.findBestMoveValue(board, rackBefore, isFirstMove);
    const bestValue = best ? Math.max(best.value, chosenMV.value) : chosenMV.value;
    const tacticalLoss = Math.max(0, bestValue - chosenMV.value);
    // Decision Quality อิงจาก Tactical Loss เทียบสเกลอ้างอิง (ไม่ใช้หารตรงๆ เพราะ Move Value ติดลบได้
    // การหารค่าติดลบทำให้สัดส่วนพลิกเครื่องหมายและให้ผลลัพธ์ผิดทิศทาง)
    const DECISION_SCALE = 20;
    const decisionQuality = Math.max(0, 100 - (tacticalLoss / DECISION_SCALE) * 100);

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
      ts: Date.now(),
    };
    currentMatch.turns.push(entry);
    turnStartedAt = Date.now();
    return entry;
  }

  function logBotTurn(turnNumber, score) {
    if (!currentMatch) return;
    currentMatch.turns.push({ actor: "bot", turnNumber, moveScore: score, ts: Date.now() });
    // เติมคะแนนคู่แข่ง (บอท) ในตาถัดไป ย้อนกลับเข้าตาผู้เล่นล่าสุด
    for (let i = currentMatch.turns.length - 2; i >= 0; i--) {
      if (currentMatch.turns[i].actor === "player") { currentMatch.turns[i].opponentNextScore = score; break; }
    }
  }

  function finalizeMatch({ result, finalPlayerScore, finalBotScore }) {
    if (!currentMatch) return null;
    currentMatch.finishedAt = Date.now();
    currentMatch.result = result;
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
    currentMatch = null;
    return finished;
  }

  function computeSummary(match) {
    const playerTurns = match.turns.filter(t => t.actor === "player");
    if (playerTurns.length === 0) return null;
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const sorted = [...playerTurns].sort((a, b) => b.decisionQuality - a.decisionQuality);
    return {
      turnsPlayed: playerTurns.length,
      avgScore: avg(playerTurns.map(t => t.moveScore)),
      avgDecisionQuality: avg(playerTurns.map(t => t.decisionQuality)),
      avgTacticalLoss: avg(playerTurns.map(t => t.tacticalLoss)),
      totalTacticalLoss: playerTurns.reduce((s, t) => s + t.tacticalLoss, 0),
      goodDecisionRate: playerTurns.filter(t => t.decisionQuality >= 70).length / playerTurns.length * 100,
      bestDecisions: sorted.slice(0, 3),
      worstDecisions: [...playerTurns].sort((a, b) => b.tacticalLoss - a.tacticalLoss).slice(0, 3).filter(t => t.tacticalLoss > 0),
      modeUsage: playerTurns.reduce((acc, t) => { if (t.suggestedMode) acc[t.suggestedMode] = (acc[t.suggestedMode] || 0) + 1; return acc; }, {}),
    };
  }

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
  }

  return { startMatch, markTurnStart, logPlayerTurn, logBotTurn, finalizeMatch, computeSummary, loadAll };
})();
