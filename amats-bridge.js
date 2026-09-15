/* AMATS Bridge — แปลงสถานะเกมจริง (กระดาน/เบี้ย/คะแนน) เป็นอินพุตของ AMATS แล้วขอคำแนะนำ
 * ทำให้ AMATS ไม่ต้องให้ผู้เล่นกรอกเอง — อ่านจากเกมจริงโดยตรง
 * หมายเหตุ: Rack Health / Board State / Threat ที่นี่เป็น "ฮิวริสติกประมาณการ" จากข้อมูลที่เห็นได้จริงบนกระดาน
 * (มือของคู่แข่งปิดอยู่ เดาสถานการณ์คู่แข่งไม่ได้ตรงๆ) ไม่ใช่การวัดที่แม่นยำสมบูรณ์
 */
const AMATS_BRIDGE = (() => {
  const GD = AMATH_DATA; // เกมจริง (บอร์ด/เบี้ย)
  const AD = typeof AMATS_DATA !== "undefined" ? AMATS_DATA : null; // AMATS (GAP/Phase/Rack levels ฯลฯ)
  const AE = typeof AMATS_ENGINE !== "undefined" ? AMATS_ENGINE : null;
  const AP2 = typeof AMATS_PHASE2 !== "undefined" ? AMATS_PHASE2 : null;

  const available = !!(AD && AE && AP2);

  const ESTIMATED_TOTAL_TURNS = 20; // ประมาณจำนวนตาทั้งเกม A-Math ทั่วไป ใช้แบ่ง Game Phase

  /** GAP จากคะแนนจริง (diff = คะแนนเรา − คะแนนคู่แข่ง) */
  function gapFromScores(myScore, oppScore) {
    if (!available) return "สูสี";
    const settings = AP2.loadSettings();
    return AP2.classifyGap(myScore - oppScore, settings);
  }

  /** Game Phase จากลำดับตาที่เล่นไปแล้ว */
  function phaseFromTurn(turnNumber) {
    if (!available) return "Midgame";
    return AP2.classifyPhase(Math.max(1, turnNumber), ESTIMATED_TOTAL_TURNS);
  }

  /**
   * Rack Health จากเบี้ยจริงในมือ — ให้คะแนนดิบตามความยืดหยุ่น แล้วแปลงเป็นระดับ
   * มี "=" ไหม (จำเป็นต่อการเริ่มสมการใหม่), มีตัวดำเนินการหลากหลายไหม, มีเลขที่ใช้ง่าย (0-12, เบี้ยเยอะ) กี่ตัว,
   * มีเบี้ยว่าง/wildcard กี่ตัว (ยืดหยุ่นสูง), มีเลขหายาก (13-20, มีใบเดียว) มากไปไหม
   */
  function rackHealthScore(rack) {
    let score = 0;
    if (rack.some(t => t.face === "=")) score += 3;
    const opChoices = new Set();
    rack.filter(t => t.kind === "operator" || t.kind === "wildcard-op").forEach(t => (t.choices || [t.face]).forEach(c => opChoices.add(c)));
    score += Math.min(opChoices.size, 4);
    const numbers = rack.filter(t => t.kind === "number");
    score += Math.min(numbers.filter(t => parseInt(t.face, 10) <= 12).length, 5);
    score += rack.filter(t => t.kind === "blank").length * 2;
    score -= numbers.filter(t => parseInt(t.face, 10) >= 15).length * 0.5;
    return score;
  }

  function rackHealthLevel(score) {
    if (score >= 14) return "Excellent";
    if (score >= 10) return "Good";
    if (score >= 6) return "Stable";
    if (score >= 3) return "Weak";
    return "Critical";
  }

  /** แปลงคะแนนดิบ Rack Health เป็น % (0-100) สำหรับแสดงเป็นแถบ — 20 คือคะแนนดิบสูงสุดที่ทำได้จริง */
  function rackHealthPct(score) {
    return Math.max(0, Math.min(100, Math.round((score / 20) * 100)));
  }

  function rackHealth(rack) {
    const s = rackHealthScore(rack);
    return { score: s, level: rackHealthLevel(s), pct: rackHealthPct(s) };
  }

  function boardFillRatio(board) {
    const filled = board.flat().filter(Boolean).length;
    return filled / (GD.BOARD_SIZE * GD.BOARD_SIZE);
  }

  /** Board State — ประมาณจากสัดส่วนช่องที่ถูกใช้ไปแล้วบนกระดาน 225 ช่อง */
  function boardState(board) {
    const ratio = boardFillRatio(board);
    if (ratio < 0.05) return "Open";
    if (ratio < 0.15) return "Balanced";
    if (ratio < 0.3) return "Controlled";
    if (ratio < 0.5) return "Restricted";
    return "Dangerous";
  }

  /** % ช่องที่ถูกใช้ไปแล้ว สำหรับแสดงเป็นแถบคู่กับ Board State */
  function boardPct(board) {
    return Math.round(boardFillRatio(board) * 100);
  }

  function emptyCellsAdjacentToLocked(board) {
    const out = [];
    for (let r = 0; r < GD.BOARD_SIZE; r++) {
      for (let c = 0; c < GD.BOARD_SIZE; c++) {
        if (board[r][c]) continue;
        const touches = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc]) =>
          rr>=0 && rr<GD.BOARD_SIZE && cc>=0 && cc<GD.BOARD_SIZE && board[rr][cc]);
        if (touches) out.push([r, c]);
      }
    }
    return out;
  }

  function premiumOpenCount(board) {
    const spots = emptyCellsAdjacentToLocked(board);
    return spots.filter(([r, c]) => ["TE", "DE", "TP"].includes(GD.bonusAt(r, c))).length;
  }

  /** Threat — ประมาณจากจำนวนช่องโบนัสชั้นดี (TE/DE/TP) ที่ "เปิด" ให้เข้าถึงได้ตอนนี้ (คู่แข่งอาจฉวยไปตาถัดไป) */
  function threatLevel(board) {
    const premium = premiumOpenCount(board);
    if (premium === 0) return "Low";
    if (premium <= 2) return "Medium";
    if (premium <= 5) return "High";
    return "Critical";
  }

  /** % ระดับ Threat สำหรับแสดงเป็นแถบ — 6 ช่องโบนัสชั้นดีที่เปิดพร้อมกันถือว่าเต็ม 100% */
  function threatPct(board) {
    return Math.max(0, Math.min(100, Math.round((premiumOpenCount(board) / 6) * 100)));
  }

  /** สรุปสถานการณ์ปัจจุบันทั้งหมด พร้อมคำแนะนำ AMATS */
  function analyze({ board, myScore, oppScore, turnNumber, rack }) {
    const gap = gapFromScores(myScore, oppScore);
    const phase = phaseFromTurn(turnNumber);
    const rh = rackHealth(rack);
    const board_ = boardState(board);
    const threat = threatLevel(board);
    const rec = available ? AE.recommendMode({ gap, phase, rack: rh.level, board: board_, threat }) : null;
    const confidence = available ? AE.confidenceScore({ gap, rack: rh.level, threat }) : null;
    return { gap, phase, rackHealth: rh, board: board_, boardPct: boardPct(board), threat, threatPct: threatPct(board), confidence, recommendation: rec };
  }

  return {
    available, gapFromScores, phaseFromTurn, rackHealth, rackHealthScore, boardState, boardPct, threatLevel, threatPct,
    analyze, emptyCellsAdjacentToLocked, totalTurns: ESTIMATED_TOTAL_TURNS,
  };
})();
