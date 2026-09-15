/* A-Math Game — ตัวตรวจสมการ, กติกาการวาง, และการคิดคะแนน (อิงคู่มือกติกาทางการ) */
const AMATH_ENGINE = (() => {
  const D = AMATH_DATA;

  /* ---------- Tokenizer + Evaluator (ไม่ใช้ eval ของ JS เพื่อคุมกติกาเองทั้งหมด) ---------- */

  // แยกสมการทั้งสตริง (อาจมีหลาย "=" ต่อกัน) ออกเป็น segment แล้ว tokenize ทีละ segment
  function tokenizeSegment(seg) {
    if (!seg) return { ok: false, error: "ฝั่งสมการว่างเปล่า" };
    let i = 0;
    const tokens = [];
    const n = seg.length;

    function readUnsignedNumber() {
      const start = i;
      while (i < n && /[0-9]/.test(seg[i])) i++;
      if (i === start) return null;
      return seg.slice(start, i);
    }

    // ตัวแรกของ segment: อนุญาตเครื่องหมายลบนำหน้า (ค่าติดลบ) แต่ห้าม + นำหน้า
    if (seg[0] === "+") return { ok: false, error: `ห้ามใช้เครื่องหมาย + นำหน้าตัวเลข ("${seg}")` };
    let leadingMinus = false;
    if (seg[0] === "-") { leadingMinus = true; i = 1; }
    const firstNumRaw = readUnsignedNumber();
    if (!firstNumRaw) return { ok: false, error: `รูปแบบไม่ถูกต้อง ("${seg}")` };
    if (firstNumRaw.length > 1 && firstNumRaw[0] === "0") return { ok: false, error: `ห้ามใช้ 0 นำหน้าตัวเลข ("${firstNumRaw}")` };
    tokens.push({ type: "num", value: (leadingMinus ? -1 : 1) * parseInt(firstNumRaw, 10) });

    while (i < n) {
      const opChar = seg[i];
      if (!"+-×÷".includes(opChar)) return { ok: false, error: `พบอักขระที่ใช้ไม่ได้ "${opChar}"` };
      i++;
      const numRaw = readUnsignedNumber();
      if (!numRaw) return { ok: false, error: `ห้ามวางเครื่องหมายติดกัน หรือจบด้วยเครื่องหมาย ("${seg}")` };
      if (numRaw.length > 1 && numRaw[0] === "0") return { ok: false, error: `ห้ามใช้ 0 นำหน้าตัวเลข ("${numRaw}")` };
      tokens.push({ type: "op", value: opChar });
      tokens.push({ type: "num", value: parseInt(numRaw, 10) });
    }
    return { ok: true, tokens };
  }

  // คำนวณตาม ลำดับ ×÷ ก่อน +− (ซ้ายไปขวาในลำดับเดียวกัน) ห้ามหารด้วย 0
  function evalTokens(tokens) {
    // pass 1: × ÷
    let vals = [tokens[0].value];
    let ops = [];
    for (let k = 1; k < tokens.length; k += 2) {
      const op = tokens[k].value;
      const num = tokens[k + 1].value;
      if (op === "×" || op === "÷") {
        if (op === "÷") {
          if (num === 0) return { ok: false, error: "ห้ามหารด้วย 0" };
          vals[vals.length - 1] = vals[vals.length - 1] / num;
        } else {
          vals[vals.length - 1] = vals[vals.length - 1] * num;
        }
      } else {
        ops.push(op);
        vals.push(num);
      }
    }
    // pass 2: + −
    let total = vals[0];
    for (let k = 0; k < ops.length; k++) {
      total = ops[k] === "+" ? total + vals[k + 1] : total - vals[k + 1];
    }
    return { ok: true, value: total };
  }

  function evalSegment(seg) {
    const t = tokenizeSegment(seg);
    if (!t.ok) return t;
    return evalTokens(t.tokens);
  }

  /** ตรวจสมการทั้งสตริง (อาจมีหลาย "=" ต่อกันได้) — ทุกฝั่งต้องมีค่าเท่ากัน */
  function validateEquation(fullString) {
    const segments = fullString.split("=");
    if (segments.length < 2) return { valid: false, error: "ต้องมีเครื่องหมาย = อย่างน้อยหนึ่งตัว" };
    if (segments.some(s => s.length === 0)) return { valid: false, error: "ห้ามมี = ติดกัน หรือ = อยู่ที่ต้น/ท้ายสมการ" };
    const values = [];
    for (const seg of segments) {
      const r = evalSegment(seg);
      if (!r.ok) return { valid: false, error: r.error };
      values.push(r.value);
    }
    const EPS = 1e-9;
    for (let i = 1; i < values.length; i++) {
      if (Math.abs(values[i] - values[0]) > EPS) return { valid: false, error: `สมการไม่สมดุล: ${segments[0]}=${values[0]} แต่ ${segments[i]}=${values[i]}` };
    }
    return { valid: true, value: values[0] };
  }

  /* ---------- คิดคะแนน ---------- */

  const RACK_NUMERIC_STUB = null; // (ไม่ใช้ในไฟล์นี้ กันชื่อชนกับไฟล์อื่น)

  /**
   * tiles: รายการเบี้ยเรียงตามแนวเดียวกัน [{ r, c, points, isNew }]
   * คะแนน = (คะแนนเบี้ยแต่ละตัว คูณช่องพิเศษเฉพาะตัวถ้าเป็นเบี้ยใหม่) รวมกัน แล้วคูณช่องพิเศษทั้งสมการ (เฉพาะจากเบี้ยใหม่)
   * ช่องพิเศษใช้ได้แค่ตอนเบี้ยลงทับครั้งแรกเท่านั้น (เบี้ยเดิมไม่คิดซ้ำ)
   */
  function scoreLine(tiles) {
    let base = 0;
    let equationMultiplier = 1;
    for (const t of tiles) {
      let pts = t.points;
      if (t.isNew) {
        const bonus = D.bonusAt(t.r, t.c);
        if (bonus === "TP") pts *= 3;
        else if (bonus === "DP") pts *= 2;
        else if (bonus === "TE") equationMultiplier *= 3;
        else if (bonus === "DE") equationMultiplier *= 2;
      }
      base += pts;
    }
    return base * equationMultiplier;
  }

  /* ---------- ตรวจการวางเบี้ยบนกระดาน ---------- */

  function inBounds(r, c) { return r >= 0 && r < D.BOARD_SIZE && c >= 0 && c < D.BOARD_SIZE; }

  /** ดึงเส้นเบี้ยต่อเนื่อง (เดิม+ใหม่) ที่ผ่านจุด (r,c) ในทิศที่กำหนด (dr,dc) */
  function extractLine(board, r, c, dr, dc) {
    let r1 = r, c1 = c;
    while (inBounds(r1 - dr, c1 - dc) && board[r1 - dr][c1 - dc]) { r1 -= dr; c1 -= dc; }
    let r2 = r, c2 = c;
    while (inBounds(r2 + dr, c2 + dc) && board[r2 + dr][c2 + dc]) { r2 += dr; c2 += dc; }
    const tiles = [];
    let rr = r1, cc = c1;
    while (rr <= r2 && cc <= c2) {
      tiles.push({ r: rr, c: cc, ...board[rr][cc] });
      if (dr === 0 && dc === 0) break;
      rr += dr; cc += dc;
      if (dr === 0 && cc > c2) break;
      if (dc === 0 && rr > r2) break;
    }
    return tiles;
  }

  function lineToString(tiles) { return tiles.map(t => t.resolvedChar).join(""); }

  /**
   * ตรวจสอบและคิดคะแนนการเดินหนึ่งตา
   * newCoords: [{r,c}] ตำแหน่งเบี้ยใหม่ที่เพิ่งวาง (board ต้อง set ค่าไว้แล้วที่ตำแหน่งเหล่านี้ พร้อม isNew:true)
   */
  function validateAndScoreMove(board, newCoords, isFirstMove) {
    if (newCoords.length === 0) return { valid: false, error: "ยังไม่ได้วางเบี้ย" };

    const rows = new Set(newCoords.map(t => t.r));
    const cols = new Set(newCoords.map(t => t.c));
    if (rows.size > 1 && cols.size > 1) return { valid: false, error: "เบี้ยต้องวางในแนวเดียวกัน (แถวหรือคอลัมน์เดียว)" };
    const horizontal = rows.size === 1;

    if (isFirstMove) {
      const [cr, cc] = D.CENTER;
      if (!newCoords.some(t => t.r === cr && t.c === cc)) return { valid: false, error: "ตาแรกต้องมีเบี้ยทับช่องดาวกลางกระดาน" };
    } else {
      const connected = newCoords.some(({ r, c }) => {
        return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc]) =>
          inBounds(rr, cc) && board[rr][cc] && !newCoords.some(n => n.r === rr && n.c === cc));
      });
      if (!connected) return { valid: false, error: "เบี้ยใหม่ต้องสัมผัสกับเบี้ยที่มีอยู่บนกระดานแล้ว" };
    }

    // เส้นหลัก (แนวที่วางเบี้ยใหม่)
    const first = newCoords[0];
    const mainLine = horizontal ? extractLine(board, first.r, first.c, 0, 1) : extractLine(board, first.r, first.c, 1, 0);
    const lines = [];
    const seen = new Set();
    if (mainLine.length > 1) {
      lines.push(mainLine);
      seen.add(mainLine.map(t => `${t.r},${t.c}`).join("|"));
    }
    // เส้นตัดขวางที่จุดของเบี้ยใหม่แต่ละตัว
    for (const nc of newCoords) {
      const cross = horizontal ? extractLine(board, nc.r, nc.c, 1, 0) : extractLine(board, nc.r, nc.c, 0, 1);
      if (cross.length > 1) {
        const key = cross.map(t => `${t.r},${t.c}`).join("|");
        if (!seen.has(key)) { seen.add(key); lines.push(cross); }
      }
    }

    if (lines.length === 0) return { valid: false, error: "ไม่พบสมการที่สมบูรณ์ (ต้องมีความยาวมากกว่า 1 ช่อง)" };

    let totalScore = 0;
    const details = [];
    for (const line of lines) {
      const str = lineToString(line);
      const result = validateEquation(str);
      if (!result.valid) return { valid: false, error: `สมการ "${str}" ไม่ถูกต้อง — ${result.error}` };
      const score = scoreLine(line);
      totalScore += score;
      details.push({ string: str, score, tiles: line });
    }

    if (newCoords.length === D.RACK_SIZE) totalScore += 40; // Bingo

    return { valid: true, score: totalScore, equations: details, bingo: newCoords.length === D.RACK_SIZE };
  }

  return {
    tokenizeSegment, evalTokens, evalSegment, validateEquation, scoreLine,
    extractLine, lineToString, validateAndScoreMove, inBounds,
  };
})();
