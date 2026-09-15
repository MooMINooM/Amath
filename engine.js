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

  return { recommendMode, moveValue, netGain, twoTurnExpectedValue, assessRackHealth };
})();
