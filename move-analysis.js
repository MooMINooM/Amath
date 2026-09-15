/* AMATS — วิเคราะห์คุณค่าการเดิน (Move Value) แบบเป็นกลาง ไม่ผูกกับ Tactical Mode เดียว
 * ใช้เทียบ Move ที่ผู้เล่นเลือก กับ Best Available Move ที่หาได้จากเบี้ยชุดเดียวกัน
 * สูตรอิงแนวทางเดิมของ AMATS: Move Value = Score + Position + Rack + Denial − Opponent Opportunity
 * โดย Position/Denial ในเกมจริงวัดจากช่องโบนัสชั้นดี (TE/DE/TP) ที่ยึดได้ และ Opponent Opportunity
 * วัดจากช่องโบนัสชั้นดีที่เดินนี้เปิดให้อีกฝ่ายเข้าถึงได้เพิ่ม
 */
const AMATS_MOVE_ANALYSIS = (() => {
  const BOT = AMATH_GAME_BOT;

  const WEIGHTS = { position: 5, opponentOpportunity: 5, rackDelta: 3 };

  /** คิด Move Value ของการเดินหนึ่งตา (candidate ต้องมี coords, tiles, score) */
  function computeMoveValue(board, candidate, rackBefore) {
    const position = BOT.premiumCellsClaimed(candidate);
    const opponentOpportunity = BOT.premiumExposureAfter(board, candidate);
    const rackAfter = BOT.rackAfterMove(rackBefore, candidate);
    const rackDelta = AMATS_BRIDGE.rackHealthScore(rackAfter) - AMATS_BRIDGE.rackHealthScore(rackBefore);
    const value = candidate.score + position * WEIGHTS.position - opponentOpportunity * WEIGHTS.opponentOpportunity + rackDelta * WEIGHTS.rackDelta;
    return { value, breakdown: { score: candidate.score, position, opponentOpportunity, rackDelta } };
  }

  /** หา Move ที่มี Move Value สูงสุดเท่าที่ค้นเจอจากเบี้ยชุดนี้ — ใช้เป็น "Best Available Move" อ้างอิง */
  function findBestMoveValue(board, rack, isFirstMove) {
    const candidates = BOT.collectCandidates(board, rack, isFirstMove, "Master");
    if (candidates.length === 0) return null;
    let best = null, bestValue = -Infinity;
    for (const c of candidates) {
      const mv = computeMoveValue(board, c, rack);
      if (mv.value > bestValue) { bestValue = mv.value; best = { ...mv, candidate: c }; }
    }
    return best;
  }

  return { computeMoveValue, findBestMoveValue };
})();
