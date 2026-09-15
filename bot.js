/* AMATS — Bot Engine สำหรับฝึกกับบอท
 * หมายเหตุสำคัญ: แอปนี้ไม่มีเอนจิน A-Math จริง (ไม่มีถุงเบี้ย ไม่มีตัวตรวจสมการ ไม่มีกระดานจริง)
 * บอทจึงไม่ได้ "จั่วเบี้ยแบบสุ่มเหมือนผู้เล่น" ตามความหมายตรงตัว — แต่จำลองแบบยุติธรรมในเชิงสถิติแทน:
 * สุ่ม Rack/Board/Threat ของบอทเองตามระดับความยาก แล้วให้บอท "ตัดสินใจ" ด้วยกฎ AMATS ชุดเดียวกับที่สอนผู้เล่น
 * (ไม่ได้มองไพ่/สถานการณ์ของผู้เล่นเลย ใช้แค่ GAP ที่กลับด้าน ซึ่งทั้งสองฝ่ายเห็นเหมือนกันอยู่แล้ว) จากนั้นสุ่มคะแนน
 * ตามช่วงที่สอดคล้องกับโหมดที่เลือก ถ้าต้องการบอทที่เดินหมากจริงจากเบี้ยจริง ต้องสร้างเอนจิน A-Math เต็มรูปแบบ
 * แยกต่างหาก (ถุงเบี้ย, การตรวจสมการ, กระดาน) ซึ่งเป็นโปรเจกต์คนละขนาดจากเครื่องมือฝึกกลยุทธ์นี้
 */
const AMATS_BOT = (() => {
  const DIFFICULTIES = {
    Rookie: {
      label: "Rookie (อ่อน)",
      rackWeights: { Excellent: 0.05, Good: 0.15, Stable: 0.3, Weak: 0.3, Critical: 0.2 },
      threatWeights: { Low: 0.5, Medium: 0.3, High: 0.15, Critical: 0.05 },
      meanMult: 0.8, sdMult: 1.4,
    },
    Standard: {
      label: "Standard (กลาง)",
      rackWeights: { Excellent: 0.15, Good: 0.3, Stable: 0.3, Weak: 0.2, Critical: 0.05 },
      threatWeights: { Low: 0.3, Medium: 0.35, High: 0.25, Critical: 0.1 },
      meanMult: 1.0, sdMult: 1.0,
    },
    Master: {
      label: "Master (แข็ง อิงกฎ AMATS)",
      rackWeights: { Excellent: 0.3, Good: 0.4, Stable: 0.2, Weak: 0.08, Critical: 0.02 },
      threatWeights: { Low: 0.15, Medium: 0.3, High: 0.35, Critical: 0.2 },
      meanMult: 1.15, sdMult: 0.7,
    },
  };
  const BOARD_WEIGHTS = { Open: 0.2, Balanced: 0.4, Controlled: 0.2, Restricted: 0.15, Dangerous: 0.05 };

  // ช่วงคะแนนโดยประมาณต่อโหมด อิงคำอธิบายลักษณะการเล่นแต่ละโหมดในเอกสาร AMATS (PRESS ผันผวนสูง/RESET คะแนนต่ำเพราะเน้นแก้มือ ฯลฯ)
  const MODE_SCORE_BASE = {
    PRESS: { mean: 28, sd: 12 },
    BUILD: { mean: 15, sd: 6 },
    CONTROL: { mean: 20, sd: 8 },
    DENY: { mean: 12, sd: 6 },
    GUARD: { mean: 18, sd: 5 },
    RESET: { mean: 8, sd: 5 },
  };

  function weightedPick(weights) {
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(weights)) {
      if (r < w) return k;
      r -= w;
    }
    return Object.keys(weights)[0];
  }
  function gaussian(mean, sd) {
    const u1 = Math.random() || 1e-9, u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * sd;
  }
  function invertGap(gap) {
    const map = { "นำมาก": "ตามมาก", "นำเล็กน้อย": "ตามเล็กน้อย", "สูสี": "สูสี", "ตามเล็กน้อย": "นำเล็กน้อย", "ตามมาก": "นำมาก" };
    return map[gap] || gap;
  }

  /**
   * จำลองตาของบอทหนึ่งตา: สุ่ม Rack/Board/Threat ของบอทตามระดับความยาก, ให้บอทเลือก Tactical Mode
   * ด้วย AMATS_ENGINE.recommendMode ชุดเดียวกับที่แนะนำผู้เล่น (โดยใช้ GAP ที่กลับด้านจากมุมของบอท),
   * แล้วสุ่มคะแนนตามช่วงของโหมดที่เลือกและระดับความยาก
   */
  function generateBotTurn({ studentGap, phase, difficulty }) {
    const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.Standard;
    const botGap = invertGap(studentGap);
    const rack = weightedPick(diff.rackWeights);
    const board = weightedPick(BOARD_WEIGHTS);
    const threat = weightedPick(diff.threatWeights);
    const rec = AMATS_ENGINE.recommendMode({ gap: botGap, phase, rack, board, threat });
    const mode = rec.primary;
    const base = MODE_SCORE_BASE[mode];
    let score = Math.round(gaussian(base.mean * diff.meanMult, base.sd * diff.sdMult));
    score = Math.max(0, Math.min(60, score));
    return { mode, rack, board, threat, score, botGap };
  }

  return { DIFFICULTIES, generateBotTurn, invertGap };
})();
