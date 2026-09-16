/* AMATS — V2: Statistical Player Model
 * แปลงข้อมูลระดับ Turn ที่ AMATS_LOGGER เก็บไว้จริงจากการเล่น (ไม่ใช่ข้อมูลจำลอง) ให้เป็น "โปรไฟล์นักเล่น"
 * ยึดหลักตาม Roadmap ข้อ 12: ไม่เริ่มจาก AI ซับซ้อน ใช้สูตรสถิติพื้นฐานจากข้อมูลจริงก่อน (Statistical Player Model)
 * ไม่ต้องเก็บข้อมูลเพิ่ม — ใช้ฟิลด์ที่ AMATS_LOGGER บันทึกอยู่แล้วทุกตาของผู้เล่น (decisionQuality, tacticalLoss,
 * moveScore, tilesUsed, opponentNextScore, suggestedMode, turnNumber)
 */
const AMATS_PROFILE = (() => {
  const MIN_TURNS = 8; // ต้องมีตาของผู้เล่นสะสมอย่างน้อยเท่านี้ถึงจะสรุปโปรไฟล์ได้อย่างมีความหมาย

  const CONTROL_MODES = ["CONTROL", "DENY", "GUARD"];
  const ALL_MODES = ["PRESS", "BUILD", "CONTROL", "DENY", "GUARD", "RESET"];

  const PROFILE_META = {
    Aggressive: { name: "Aggressive Player", strength: "ทำคะแนนก้อนใหญ่และสร้าง Pace สูง", watch: "เปิด Board Risk และ Rack เสื่อมเร็ว" },
    Control: { name: "Control Player", strength: "คุมกระดานและลดคะแนนคู่แข่ง", watch: "อาจพลาดโอกาสทำคะแนนก้อนใหญ่" },
    Consistent: { name: "Consistent Player", strength: "คะแนนต่อ Turn เสถียร", watch: "อาจขาดจังหวะพลิกเกมเมื่อตาม" },
    Tactical: { name: "Tactical Player", strength: "เปลี่ยน Mode ตามสถานการณ์ได้ดี", watch: "ต้องอาศัยการอ่านเกมและข้อมูล" },
    Endgame: { name: "Endgame Player", strength: "ปิดเกมและบริหารความได้เปรียบดี", watch: "ต้องมีวินัยสูงในช่วงต้น-กลางเกม" },
  };

  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

  function stddev(arr) {
    if (arr.length < 2) return 0;
    const m = avg(arr);
    return Math.sqrt(avg(arr.map(v => (v - m) ** 2)));
  }

  function clamp01to100(v) { return Math.max(0, Math.min(100, Math.round(v))); }

  /** โหมด Aggressive — ยิ่งทำคะแนนเฉลี่ยต่อตาสูงและทำ BINGO บ่อย ยิ่งคะแนนสูง */
  function aggressiveScore(turns) {
    const avgScore = avg(turns.map(t => t.moveScore));
    const bingoRate = turns.filter(t => t.tilesUsed === AMATH_DATA.RACK_SIZE).length / turns.length;
    return clamp01to100(avgScore * 3 + bingoRate * 40);
  }

  /** โหมด Control — ตัดสินใจได้ดี (Decision Quality สูง) เฉพาะตอนสถานการณ์เรียกร้องให้เล่นเชิงคุม/ตัด
   * บวกกับ "ปิดโอกาส" ได้จริง (คะแนนที่คู่แข่งทำได้ตาถัดไปต่ำ) */
  function controlScore(turns) {
    const defensiveTurns = turns.filter(t => CONTROL_MODES.includes(t.suggestedMode));
    const dqDefensive = defensiveTurns.length ? avg(defensiveTurns.map(t => t.decisionQuality)) : avg(turns.map(t => t.decisionQuality));
    const denialTurns = turns.filter(t => typeof t.opponentNextScore === "number");
    const denialFactor = denialTurns.length ? avg(denialTurns.map(t => Math.max(0, 20 - t.opponentNextScore))) / 20 * 100 : 50;
    return clamp01to100(dqDefensive * 0.7 + denialFactor * 0.3);
  }

  /** โหมด Consistent — Decision Quality ผันผวนน้อย (ส่วนเบี่ยงเบนมาตรฐานต่ำ) */
  function consistentScore(turns) {
    const sd = stddev(turns.map(t => t.decisionQuality));
    return clamp01to100(100 - sd);
  }

  /** โหมด Tactical — ตัดสินใจได้ดี (DQ เฉลี่ย >= 60) ในสถานการณ์ที่หลากหลายโหมด ไม่ใช่ถนัดแค่ทางเดียว */
  function tacticalScore(turns) {
    let goodModes = 0;
    for (const mode of ALL_MODES) {
      const modeTurns = turns.filter(t => t.suggestedMode === mode);
      if (modeTurns.length >= 2 && avg(modeTurns.map(t => t.decisionQuality)) >= 60) goodModes++;
    }
    return clamp01to100((goodModes / ALL_MODES.length) * 100);
  }

  /** โหมด Endgame — Decision Quality ช่วงท้ายเกม (Late Game/Endgame) ดีกว่าช่วงต้น-กลางเกมแค่ไหน */
  function endgameScore(turns) {
    const withPhase = turns.map(t => ({ ...t, phase: AMATS_BRIDGE.phaseFromTurn(t.turnNumber) }));
    const lateTurns = withPhase.filter(t => t.phase === "Late Game" || t.phase === "Endgame");
    const earlyTurns = withPhase.filter(t => t.phase === "Opening" || t.phase === "Early Midgame" || t.phase === "Midgame");
    if (lateTurns.length === 0) return 50; // ไม่มีข้อมูลช่วงท้ายเกมพอ ให้เป็นกลาง
    const dqLate = avg(lateTurns.map(t => t.decisionQuality));
    const dqEarly = earlyTurns.length ? avg(earlyTurns.map(t => t.decisionQuality)) : dqLate;
    return clamp01to100(50 + (dqLate - dqEarly));
  }

  /** สรุปโปรไฟล์นักเล่นจากประวัติการเล่นจริงทั้งหมดที่ AMATS_LOGGER เก็บไว้ (สูงสุด 30 เกมล่าสุด) */
  function computeProfile() {
    const matches = AMATS_LOGGER.loadAll();
    const playerTurns = matches.flatMap(m => (m.turns || []).filter(t => t.actor === "player"));
    if (playerTurns.length < MIN_TURNS) {
      return { insufficient: true, sampleSize: playerTurns.length, minTurns: MIN_TURNS };
    }

    const scoresRaw = {
      Aggressive: aggressiveScore(playerTurns),
      Control: controlScore(playerTurns),
      Consistent: consistentScore(playerTurns),
      Tactical: tacticalScore(playerTurns),
      Endgame: endgameScore(playerTurns),
    };
    const ranked = Object.entries(scoresRaw).sort((a, b) => b[1] - a[1]);
    const primaryKey = ranked[0][0];
    const secondaryKey = ranked[1][0];

    const finished = matches.filter(m => m.result);
    const wins = finished.filter(m => m.result === "win").length;
    const winRate = finished.length ? wins / finished.length : null;

    return {
      insufficient: false,
      sampleSize: playerTurns.length,
      matchesCount: matches.length,
      winRate,
      avgScore: avg(playerTurns.map(t => t.moveScore)),
      avgDecisionQuality: avg(playerTurns.map(t => t.decisionQuality)),
      scores: scoresRaw,
      primary: PROFILE_META[primaryKey],
      secondary: PROFILE_META[secondaryKey],
    };
  }

  return { computeProfile, MIN_TURNS };
})();
