/* AMATS — Rule engine (Phase 1: Rule-based) ตามเอกสารแนวคิด AMATS */
const AMATS_ENGINE = (() => {
  const D = AMATS_DATA;

  /**
   * แนะนำ Tactical Mode จาก Game State
   * ลำดับความสำคัญ: Threat Critical > Rack Critical > ตาราง GAP หลัก > ปรับจาก Threat/Board เพิ่มเติม
   */
  function recommendMode({ gap, phase, rack, board, threat }) {
    const reasons = [];

    // กฎที่ 1: Threat วิกฤต ต้องตัดก่อนคิดคะแนนของเรา
    if (threat === "Critical") {
      reasons.push("Threat อยู่ระดับ Critical — ตามหลักการ AMATS การเลือก DENY แม้ได้คะแนนต่ำกว่าอาจดีกว่า PRESS ที่เปิดเกมให้คู่แข่ง");
      return {
        primary: "DENY",
        secondary: "CONTROL",
        reasons,
        risk: D.RISK_TABLE[gap] || null,
      };
    }

    // กฎที่ 2: Rack วิกฤต ควรปรับมือก่อน
    if (rack === "Critical") {
      reasons.push("Rack Health อยู่ระดับ Critical — แทบไม่มีการเดินที่คุ้มค่า ควรพิจารณา RESET เพื่อแก้คุณภาพมือก่อนเสีย Pace ต่อเนื่อง");
      return {
        primary: "RESET",
        secondary: "CONTROL",
        reasons,
        risk: D.RISK_TABLE[gap] || null,
      };
    }

    // กฎที่ 3: ฐานจากตาราง GAP
    const base = D.GAP_TABLE[gap] || D.GAP_TABLE["สูสี"];
    let primary = base.primary;
    let secondary = base.secondary;
    reasons.push(`สถานการณ์คะแนน “${gap}” → โหมดหลักตามตารางคือ ${primary}, โหมดรองคือ ${secondary}`);

    // กฎที่ 4: Threat สูง ให้ดึงเข้าหา DENY/CONTROL มากขึ้น
    if (threat === "High" && primary !== "DENY" && primary !== "GUARD") {
      secondary = "DENY";
      reasons.push("Threat อยู่ระดับ High — ปรับโหมดรองเป็น DENY เพื่อลดความเสี่ยงจากคู่แข่ง");
    }

    // กฎที่ 5: Rack อ่อนแรง ให้เตือนเรื่อง RESET เป็นทางเลือกเสริม
    if (rack === "Weak") {
      reasons.push("Rack Health อยู่ระดับ Weak — หากไม่มี BUILD ที่ดี ให้พิจารณาเตรียม RESET ในตาถัดไป");
    }

    // กฎที่ 6: กระดานอันตราย เตือนให้ระวังแม้โหมดหลักจะไม่ใช่ DENY
    if (board === "Dangerous" && primary !== "DENY") {
      reasons.push("Board State อยู่ในระดับ Dangerous — แม้โหมดหลักไม่ใช่ DENY ก็ควรประเมิน Threat ของคู่แข่งก่อนเดินทุกครั้ง");
    }

    // กฎที่ 7: กระดานเปิดกว้างและไม่ได้ตามอยู่มาก ให้โอกาส BUILD เป็นทางเลือกเสริม
    if (board === "Open" && (gap === "สูสี" || gap === "นำเล็กน้อย" || gap === "ตามเล็กน้อย") && secondary !== "BUILD") {
      reasons.push("Board State เปิดกว้างและมีโอกาสสร้างทางในตาถัดไป — BUILD เป็นทางเลือกเสริมที่ควรพิจารณา");
    }

    return {
      primary,
      secondary,
      reasons,
      risk: D.RISK_TABLE[gap] || null,
    };
  }

  const GAP_CLARITY = { "สูสี": 40, "นำเล็กน้อย": 65, "ตามเล็กน้อย": 65, "นำมาก": 90, "ตามมาก": 90 };
  const THREAT_CLARITY = { Low: 85, Medium: 70, High: 60, Critical: 95 };
  const RACK_CLARITY = { Excellent: 90, Good: 85, Stable: 70, Weak: 55, Critical: 90 };

  /**
   * ความมั่นใจของคำแนะนำ (ไม่ใช่ความมั่นใจว่าจะชนะ) — ยิ่งสถานการณ์ชัดเจน (GAP ห่างมาก, Threat/Rack วิกฤตจนมีกฎตัดสินตรงๆ)
   * ยิ่งมั่นใจว่าโหมดที่แนะนำถูกต้อง ตรงข้ามกับสถานการณ์สูสีก้ำกึ่งที่ยังเลือกได้หลายทาง
   */
  function confidenceScore({ gap, rack, threat }) {
    const g = GAP_CLARITY[gap] ?? 60;
    const t = THREAT_CLARITY[threat] ?? 60;
    const r = RACK_CLARITY[rack] ?? 60;
    return Math.round((g + t + r) / 3);
  }

  // ยิ่งใกล้จบเกม ผลต่างคะแนนที่มีอยู่ ณ ตอนนี้ยิ่ง "นิ่ง" ขึ้น (พลิกกลับได้ยากกว่าช่วงต้นเกมที่เหลือเวลาเยอะ)
  const PHASE_GAP_WEIGHT = { Opening: 0.5, "Early Midgame": 0.7, Midgame: 0.9, "Late Game": 1.2, Endgame: 1.6 };

  /**
   * V5: Win Probability Engine (แบบเบา) — ข้อมูลแมตช์จริงที่เก็บได้ (สูงสุด 30 เกมต่อเบราว์เซอร์) ยังน้อยเกินกว่าจะฝึกโมเดล
   * สถิติที่แม่นยำได้ (ตามหลักการข้อ 12: อย่าเริ่มจาก AI ซับซ้อนก่อน) จึงใช้สูตร logistic รวมสัญญาณที่ AMATS
   * คำนวณอยู่แล้วทั้งหมด (GAP ดิบ, ช่วงเกม, คุณภาพมือ, Threat ที่ถ่วงน้ำหนักตามคู่แข่งจาก V3 แล้ว)
   * ค่าที่ได้เป็น "ตัวชี้แนวโน้ม" ไม่ใช่ความน่าจะเป็นที่ผ่านการ calibrate จากข้อมูลจริง — ควรอ่านแบบเปรียบเทียบ
   * (ตานี้ดีขึ้น/แย่ลงกว่าเมื่อครู่) มากกว่าเชื่อเป็นตัวเลขสัมบูรณ์
   */
  function winProbability({ gap, phase, rackPct, threatPct }) {
    const phaseWeight = PHASE_GAP_WEIGHT[phase] ?? 0.9;
    const z = (gap / 15) * phaseWeight + ((rackPct - 50) / 100) * 1.2 - (threatPct / 100) * 1.0;
    const p = 1 / (1 + Math.exp(-z));
    return Math.round(p * 100);
  }

  /** คำนวณ Move Value = Score + Position + Rack + Denial − Opponent Opportunity */
  function moveValue({ score = 0, position = 0, rack = 0, denial = 0, opponentOpportunity = 0 }) {
    return score + position + rack + denial - opponentOpportunity;
  }

  /** Net Gain = Our Score − Expected Opponent Score */
  function netGain(ourScore, expectedOpponentScore) {
    return ourScore - expectedOpponentScore;
  }

  /**
   * Phase 3 — จำลอง 2 Turn ล่วงหน้า (Two-Turn Thinking: Our Move → Opponent Response → Our Next Move)
   * คำนวณ Expected Value โดยถ่วงน้ำหนักการตอบของคู่แข่งแต่ละทางด้วยความน่าจะเป็น (prob เป็น 0–100)
   * branches: [{ prob, oppScore, nextMoveValue }]
   */
  function twoTurnExpectedValue(immediateMoveValue, branches) {
    const continuation = branches.reduce((sum, b) => sum + (b.prob / 100) * (b.nextMoveValue - b.oppScore), 0);
    return immediateMoveValue + continuation;
  }

  /** ประเมิน Rack Health จากแบบสอบถามสั้น → คืนระดับ + คะแนนดิบ */
  function assessRackHealth(answers) {
    const total = D.RACK_CHECK_QUESTIONS.reduce((sum, q) => sum + (answers[q.id] ? q.weight : 0), 0);
    const max = D.RACK_CHECK_QUESTIONS.reduce((sum, q) => sum + q.weight, 0);
    let level;
    if (total >= max) level = "Excellent";
    else if (total >= max * 0.75) level = "Good";
    else if (total >= max * 0.5) level = "Stable";
    else if (total >= max * 0.25) level = "Weak";
    else level = "Critical";
    return { total, max, level };
  }

  return { recommendMode, moveValue, netGain, twoTurnExpectedValue, assessRackHealth, confidenceScore, winProbability };
})();
