/* A-Math Game — บอทที่ค้นหาการเดินจริงจากเบี้ยในมือ
 * ใช้การค้นแบบกำหนดเป้าหมาย (หาเบี้ยที่คำนวณได้ค่าที่ต้องการจริงๆ) แทนการสุ่มเรียงแล้วเดา
 * เพราะการสุ่มเรียงเบี้ยล้วนๆ แทบไม่มีทางบังเอิญได้สมการที่ถูกต้องเลยในทางสถิติ
 */
const AMATH_GAME_BOT = (() => {
  const D = AMATH_DATA;
  const E = AMATH_ENGINE;

  const DIFFICULTY = {
    Rookie: { useTriple: false, useQuad: false, placementTries: 30 },
    Standard: { useTriple: true, useQuad: false, placementTries: 80 },
    Master: { useTriple: true, useQuad: true, placementTries: 200 },
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function opValue(av, opChar, bv) {
    if (opChar === "+") return av + bv;
    if (opChar === "-") return av - bv;
    if (opChar === "×") return av * bv;
    if (opChar === "÷") return bv === 0 ? null : av / bv;
    return null;
  }

  function asResolved(tile, ch) { return { ...tile, resolvedChar: ch }; }

  /** ค่าที่เป็นไปได้ของเบี้ยหนึ่งใบ (เบี้ยตัวเลขคือค่าตายตัว, BLANK คือ 0-20 ได้ทั้งหมด) */
  function possibleValues(tile) {
    if (tile.kind === "number") return [parseInt(tile.face, 10)];
    if (tile.kind === "blank") return Array.from({ length: 21 }, (_, i) => i);
    return [];
  }

  /** หาเบี้ยเดี่ยว (รวม BLANK) ในมือที่มีค่าตรงกับ target */
  function findSingle(numbers, target, exclude) {
    for (const t of numbers) {
      if (exclude.has(t.id)) continue;
      if (possibleValues(t).includes(target)) return [asResolved(t, String(target))];
    }
    return null;
  }

  /** หา a op b (รวม BLANK เป็นตัวเลขได้) ที่มีค่าตรงกับ target จากเบี้ยในมือ */
  function findPair(numbers, ops, target, exclude) {
    for (let i = 0; i < numbers.length; i++) {
      if (exclude.has(numbers[i].id)) continue;
      for (let j = 0; j < numbers.length; j++) {
        if (i === j || exclude.has(numbers[j].id)) continue;
        for (const av of possibleValues(numbers[i])) {
          for (const bv of possibleValues(numbers[j])) {
            for (const opTile of ops) {
              if (exclude.has(opTile.id)) continue;
              for (const opChar of (opTile.choices || [opTile.face])) {
                const v = opValue(av, opChar, bv);
                if (v === target) {
                  return [asResolved(numbers[i], String(av)), asResolved(opTile, opChar), asResolved(numbers[j], String(bv))];
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  /** หานิพจน์ (เบี้ยเดี่ยว หรือ a op b) จากมือที่มีค่าตรงกับ target */
  function findExpressionEqualing(rack, target, useTriple, exclude = new Set()) {
    const numbers = rack.filter(t => t.kind === "number" || t.kind === "blank");
    const ops = rack.filter(t => t.kind === "operator" || t.kind === "wildcard-op");
    const single = findSingle(numbers, target, exclude);
    if (single) return single;
    if (useTriple) return findPair(numbers, ops, target, exclude);
    return null;
  }

  /** สร้างสมการใหม่ทั้งหมดจากมือ (ไม่ต้องอิงกระดาน): X=X, a op b=c, หรือ a op1 b=c op2 d */
  function findFreshEquation(rack, cfg) {
    // เบี้ยว่าง (Blank) เลือกเป็น "=" ได้ ให้ใช้ "=" จริงก่อนเสมอ ถ้าไม่มีค่อยยอมเสีย Blank มาทำหน้าที่นี้แทน
    const realEq = rack.filter(t => t.face === "=");
    const eqTiles = realEq.length ? realEq : rack.filter(t => t.kind === "blank");
    if (eqTiles.length === 0) return null;
    const eq = eqTiles[0];
    const numbers = rack.filter(t => (t.kind === "number" || t.kind === "blank") && t.id !== eq.id);
    const ops = rack.filter(t => (t.kind === "operator" || t.kind === "wildcard-op") && t.id !== eq.id);
    if (numbers.length < 2) return null;

    // X = X
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        const common = possibleValues(numbers[i]).find(v => possibleValues(numbers[j]).includes(v));
        if (common !== undefined) {
          return [asResolved(numbers[i], String(common)), asResolved(eq, "="), asResolved(numbers[j], String(common))];
        }
      }
    }

    if (cfg.useTriple) {
      // a op b = c
      for (let i = 0; i < numbers.length; i++) {
        for (let j = 0; j < numbers.length; j++) {
          if (i === j) continue;
          for (const av of possibleValues(numbers[i])) {
            for (const bv of possibleValues(numbers[j])) {
              for (const opTile of ops) {
                for (const opChar of (opTile.choices || [opTile.face])) {
                  const v = opValue(av, opChar, bv);
                  if (v === null) continue;
                  for (let k = 0; k < numbers.length; k++) {
                    if (k === i || k === j) continue;
                    if (possibleValues(numbers[k]).includes(v)) {
                      return [
                        asResolved(numbers[i], String(av)), asResolved(opTile, opChar), asResolved(numbers[j], String(bv)),
                        asResolved(eq, "="), asResolved(numbers[k], String(v)),
                      ];
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (cfg.useQuad && numbers.length >= 4 && ops.length >= 2) {
      // a op1 b = c op2 d
      for (let i = 0; i < numbers.length; i++) for (let j = 0; j < numbers.length; j++) {
        if (i === j) continue;
        const av = parseInt(numbers[i].face, 10), bv = parseInt(numbers[j].face, 10);
        for (const op1 of ops) for (const op1c of (op1.choices || [op1.face])) {
          const v1 = opValue(av, op1c, bv);
          if (v1 === null) continue;
          for (let k = 0; k < numbers.length; k++) for (let l = 0; l < numbers.length; l++) {
            if (k === l || k === i || k === j || l === i || l === j) continue;
            const cv = parseInt(numbers[k].face, 10), dv = parseInt(numbers[l].face, 10);
            for (const op2 of ops) {
              if (op2.id === op1.id) continue;
              for (const op2c of (op2.choices || [op2.face])) {
                const v2 = opValue(cv, op2c, dv);
                if (v2 === v1) {
                  return [
                    asResolved(numbers[i], numbers[i].face), asResolved(op1, op1c), asResolved(numbers[j], numbers[j].face),
                    asResolved(eq, "="),
                    asResolved(numbers[k], numbers[k].face), asResolved(op2, op2c), asResolved(numbers[l], numbers[l].face),
                  ];
                }
              }
            }
          }
        }
      }
    }
    return null;
  }

  function cloneBoard(board) { return board.map(row => row.map(cell => (cell ? { ...cell } : null))); }

  function inBounds(r, c) { return E.inBounds(r, c); }

  function fitsEmpty(board, r, c, dr, dc, len) {
    const coords = [];
    for (let k = 0; k < len; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (!inBounds(rr, cc) || board[rr][cc]) return null;
      coords.push({ r: rr, c: cc });
    }
    return coords;
  }

  function emptyCellsAdjacentToLocked(board) {
    const out = [];
    for (let r = 0; r < D.BOARD_SIZE; r++) {
      for (let c = 0; c < D.BOARD_SIZE; c++) {
        if (board[r][c]) continue;
        const touches = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].some(([rr,cc]) =>
          inBounds(rr, cc) && board[rr][cc]);
        if (touches) out.push([r, c]);
      }
    }
    return out;
  }

  function tryValidatePlacement(board, tiles, coords, isFirstMove) {
    const testBoard = cloneBoard(board);
    coords.forEach(({ r, c }, i) => {
      const t = tiles[i];
      testBoard[r][c] = { points: t.points, resolvedChar: t.resolvedChar, isNew: true, kind: t.kind, face: t.face, id: t.id };
    });
    const result = E.validateAndScoreMove(testBoard, coords, isFirstMove);
    return result.valid ? { coords, tiles, score: result.score, equations: result.equations } : null;
  }

  /** วางลำดับเบี้ย (tiles) ลงกระดานแบบสด — ลองรอบตำแหน่งว่างที่ติดกับเบี้ยเดิม (หรือช่องดาวถ้าตาแรก) เก็บหลายผลลัพธ์ */
  function placeFresh(board, tiles, isFirstMove, tries, limit = 1) {
    const len = tiles.length;
    const attempts = [];
    if (isFirstMove) {
      const [cr, cc] = D.CENTER;
      for (let offset = 0; offset < len; offset++) {
        attempts.push([cr, cc - offset, 0, 1]); // horizontal
        attempts.push([cr - offset, cc, 1, 0]); // vertical
      }
    } else {
      const spots = shuffle(emptyCellsAdjacentToLocked(board)).slice(0, tries);
      for (const [r, c] of spots) {
        for (let offset = 0; offset < len; offset++) {
          attempts.push([r, c - offset, 0, 1]);
          attempts.push([r - offset, c, 1, 0]);
        }
      }
    }
    const results = [];
    for (const [r, c, dr, dc] of attempts) {
      const coords = fitsEmpty(board, r, c, dr, dc, len);
      if (!coords) continue;
      const result = tryValidatePlacement(board, tiles, coords, isFirstMove);
      if (result) { results.push(result); if (results.length >= limit) break; }
    }
    return results;
  }

  /** ลองขยายสมการเดิมบนกระดาน: ต่อ "= นิพจน์ใหม่" ต่อท้าย หรือ "นิพจน์ใหม่ =" ไว้หน้า ให้เท่ากับค่าเดิมของเส้นนั้น เก็บหลายผลลัพธ์ */
  function attemptExtendLines(board, rack, cfg, limit = 1) {
    const results = [];
    const seen = new Set();
    const lines = [];
    for (let r = 0; r < D.BOARD_SIZE; r++) {
      for (let c = 0; c < D.BOARD_SIZE; c++) {
        if (!board[r][c]) continue;
        for (const [dr, dc] of [[0,1],[1,0]]) {
          const line = E.extractLine(board, r, c, dr, dc);
          if (line.length < 2) continue;
          const key = dr + "," + line.map(t=>`${t.r},${t.c}`).join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          lines.push({ line, dr, dc });
        }
      }
    }
    for (const { line, dr, dc } of shuffle(lines)) {
      const str = E.lineToString(line);
      const evalResult = E.evalSegment(str.includes("=") ? str.split("=")[0] : str);
      // ใช้ค่าของสมการทั้งเส้น (ทุกฝั่งเท่ากันอยู่แล้วถ้าเป็นสมการที่ล็อกไว้ถูกต้อง)
      const check = E.validateEquation(str);
      if (!check.valid) continue;
      const target = check.value;
      const realEq = rack.filter(t => t.face === "=");
      const eqTiles = realEq.length ? realEq : rack.filter(t => t.kind === "blank");
      if (eqTiles.length === 0) continue;
      const expr = findExpressionEqualing(rack, target, cfg.useTriple, new Set([eqTiles[0].id]));
      if (!expr) continue;
      const eq = eqTiles[0];

      // ต่อท้าย: [เส้นเดิม] = expr
      const afterR = line[line.length - 1].r + dr, afterC = line[line.length - 1].c + dc;
      const appendTiles = [asResolved(eq, "="), ...expr];
      const appendCoords = fitsEmpty(board, afterR, afterC, dr, dc, appendTiles.length);
      if (appendCoords) {
        const result = tryValidatePlacement(board, appendTiles, appendCoords, false);
        if (result) { results.push(result); if (results.length >= limit) return results; }
      }
      // ต่อหน้า: expr = [เส้นเดิม]
      const beforeTiles = [...expr, asResolved(eq, "=")];
      const startR = line[0].r - dr * beforeTiles.length, startC = line[0].c - dc * beforeTiles.length;
      const prependCoords = fitsEmpty(board, startR, startC, dr, dc, beforeTiles.length);
      if (prependCoords) {
        const result = tryValidatePlacement(board, beforeTiles, prependCoords, false);
        if (result) { results.push(result); if (results.length >= limit) return results; }
      }
    }
    return results;
  }

  /**
   * ลองสร้างสมการใหม่ที่ "ทับผ่าน" เบี้ยตัวเลขที่มีอยู่แล้วบนกระดาน (เหมือนไขว้คำใน Scrabble)
   * ใช้ค่าของเบี้ยเดิมเป็นส่วนหนึ่งของสมการใหม่ โดยวางเบี้ยใหม่ในแนวตั้งฉากเฉพาะช่องว่างก่อน/หลังเบี้ยนั้น
   */
  function attemptCrossAtTile(board, rack, cfg, limit = 1) {
    const results = [];
    const anchors = [];
    for (let r = 0; r < D.BOARD_SIZE; r++) {
      for (let c = 0; c < D.BOARD_SIZE; c++) {
        const cell = board[r][c];
        if (!cell || !/^[0-9]+$/.test(cell.resolvedChar)) continue;
        anchors.push({ r, c, value: parseInt(cell.resolvedChar, 10) });
      }
    }
    const realEqAll = rack.filter(t => t.face === "=");
    const eqTilesAll = realEqAll.length ? realEqAll : rack.filter(t => t.kind === "blank");
    if (eqTilesAll.length === 0) return results;

    for (const { r, c, value } of shuffle(anchors)) {
      if (Number.isNaN(value)) continue;
      for (const [dr, dc] of [[0,1],[1,0]]) {
        // ต้องว่างทั้งสองด้าน (ก่อนและ/หรือหลัง) ตามแนวตั้งฉากกับเส้นเดิมของเบี้ยนี้
        const before = { r: r - dr, c: c - dc };
        const after = { r: r + dr, c: c + dc };
        const beforeOpen = inBounds(before.r, before.c) && !board[before.r][before.c];
        const afterOpen = inBounds(after.r, after.c) && !board[after.r][after.c];
        if (!beforeOpen && !afterOpen) continue;

        const eq = eqTilesAll[0];
        // รูปแบบ: expr = [เบี้ยเดิม]  (expr อยู่ก่อนหน้า)
        if (beforeOpen) {
          const expr = findExpressionEqualing(rack, value, cfg.useTriple, new Set([eq.id]));
          if (expr) {
            const seq = [...expr, asResolved(eq, "=")];
            const startR = r - dr * seq.length, startC = c - dc * seq.length;
            const coords = fitsEmpty(board, startR, startC, dr, dc, seq.length);
            if (coords) {
              const result = tryValidatePlacement(board, seq, coords, false);
              if (result) { results.push(result); if (results.length >= limit) return results; }
            }
          }
        }
        // รูปแบบ: [เบี้ยเดิม] = expr  (expr อยู่ถัดไป)
        if (afterOpen) {
          const expr = findExpressionEqualing(rack, value, cfg.useTriple, new Set([eq.id]));
          if (expr) {
            const seq = [asResolved(eq, "="), ...expr];
            const coords = fitsEmpty(board, after.r, after.c, dr, dc, seq.length);
            if (coords) {
              const result = tryValidatePlacement(board, seq, coords, false);
              if (result) { results.push(result); if (results.length >= limit) return results; }
            }
          }
        }
      }
    }
    return results;
  }

  /**
   * ลองต่อสมการใหม่ผ่านเบี้ย "=" ที่มีอยู่แล้วบนกระดาน (คนละเส้นกับสมการเดิมที่ "=" นั้นสังกัดอยู่)
   * ข้อดีคือไม่ต้องเสียเบี้ย "=" ของตัวเองเลย — ต้องมีช่องว่างพอดี 1 ช่องทั้งสองฝั่งของ "=" ในแนวตั้งฉาก
   * แล้วหาสองนิพจน์ที่ค่าเท่ากันจากมือมาวางคร่อม (ตอนนี้รองรับเบี้ยเดี่ยวต่อเบี้ยเดี่ยวก่อน ยังไม่รองรับ a op b ทั้งสองฝั่ง)
   */
  function attemptCrossAtEquals(board, rack, cfg, limit = 1) {
    const results = [];
    const anchors = [];
    for (let r = 0; r < D.BOARD_SIZE; r++) {
      for (let c = 0; c < D.BOARD_SIZE; c++) {
        const cell = board[r][c];
        if (cell && cell.resolvedChar === "=") anchors.push({ r, c });
      }
    }
    const numbers = rack.filter(t => t.kind === "number" || t.kind === "blank");

    for (const { r, c } of shuffle(anchors)) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const before = { r: r - dr, c: c - dc };
        const after = { r: r + dr, c: c + dc };
        const beforeOpen = inBounds(before.r, before.c) && !board[before.r][before.c];
        const afterOpen = inBounds(after.r, after.c) && !board[after.r][after.c];
        if (!beforeOpen || !afterOpen) continue; // ต้องว่างทั้งสองฝั่งพอดี เพราะ "=" ตรงกลางมีอยู่แล้ว ไม่ใช่เบี้ยที่เราวาง

        for (let i = 0; i < numbers.length; i++) {
          for (let j = 0; j < numbers.length; j++) {
            if (i === j) continue;
            const common = possibleValues(numbers[i]).find(v => possibleValues(numbers[j]).includes(v));
            if (common === undefined) continue;
            const tiles = [asResolved(numbers[i], String(common)), asResolved(numbers[j], String(common))];
            const result = tryValidatePlacement(board, tiles, [before, after], false);
            if (result) { results.push(result); if (results.length >= limit) return results; }
          }
        }
      }
    }
    return results;
  }

  const CANDIDATE_LIMIT = { Rookie: 1, Standard: 4, Master: 10 };

  /** ช่องโบนัสชั้นดี (TE/DE/TP) ที่เบี้ยใหม่ในการเดินนี้ไปครอบครอง (ยิ่งมากยิ่ง "กัน" ไม่ให้อีกฝ่ายได้) */
  function premiumCellsClaimed(candidate) {
    return candidate.coords.filter(({ r, c }) => ["TE", "DE", "TP"].includes(D.bonusAt(r, c))).length;
  }

  /** ช่องโบนัสชั้นดีที่ "เปิดใหม่" ให้อีกฝ่ายเข้าถึงได้ต่อจากการเดินนี้ (ยิ่งน้อยยิ่งปลอดภัย) */
  function premiumExposureAfter(board, candidate) {
    const testBoard = cloneBoard(board);
    candidate.coords.forEach(({ r, c }, i) => {
      const t = candidate.tiles[i];
      testBoard[r][c] = { points: t.points, resolvedChar: t.resolvedChar, locked: true };
    });
    return AMATS_BRIDGE.emptyCellsAdjacentToLocked(testBoard)
      .filter(([r, c]) => ["TE", "DE", "TP"].includes(D.bonusAt(r, c))).length;
  }

  /**
   * V4 (แบบเบา) — Multi-turn Simulation: จำลองว่าถ้าเดินจบด้วยมือที่เหลือนี้ จะหาทางเดิน "ตาถัดไป" ที่ดีที่สุด
   * ได้จริงแค่ไหน (ค้นหาจริงด้วย collectCandidates ไม่ใช่แค่ฮิวริสติกกะคุณภาพมือลอยๆ แบบเดิม)
   * ข้อจำกัด: ใช้กระดานปัจจุบันเป็นฐานประมาณ เพราะยังไม่รู้ว่าคู่แข่งจะเดินอะไรคั่นกลาง (ยังไม่มี Opponent Model — V3)
   * จึงเป็นการประมาณค่าตาถัดไปของ "ตัวเอง" เท่านั้น ไม่ใช่การจำลองครบ 4 ชั้นตาม Roadmap
   * จำกัดค้นหาระดับ "Standard" คงที่ (ไม่ใช้ระดับความยากของบอทเอง) เพื่อคุมต้นทุนการคำนวณให้เดา
   */
  function simulateNextTurnValue(board, rackAfter) {
    const nextCandidates = collectCandidates(board, rackAfter, false, "Standard");
    if (nextCandidates.length === 0) return 0;
    return Math.max(...nextCandidates.map(c => c.score));
  }

  /** ให้คะแนนผู้ท้าชิงแต่ละตัวตาม Tactical Mode ที่ AMATS แนะนำ ยิ่งสูงยิ่งเหมาะกับโหมดนั้น
   * (difficulty ใช้แค่เปิด/ปิด V4 lookahead สำหรับ BUILD/RESET — จำกัดไว้ที่ Master ก่อนเพื่อคุมต้นทุนการคำนวณ) */
  function scoreCandidateForMode(candidate, mode, board, rackAfter, difficulty) {
    switch (mode) {
      case "PRESS": return candidate.score;
      case "GUARD": return candidate.score * 0.3 - premiumExposureAfter(board, candidate) * 8;
      case "DENY": return premiumCellsClaimed(candidate) * 10 + candidate.score * 0.2;
      case "BUILD":
      case "RESET": {
        const rackScore = AMATS_BRIDGE.rackHealthScore(rackAfter);
        const lookahead = difficulty === "Master" ? simulateNextTurnValue(board, rackAfter) : 0;
        return rackScore * 4 + lookahead * 1.5 + candidate.score * 0.15;
      }
      case "CONTROL":
      default: return candidate.score - premiumExposureAfter(board, candidate) * 3;
    }
  }

  function rackAfterMove(rack, candidate) {
    const usedIds = new Set(candidate.tiles.map(t => t.id));
    return rack.filter(t => !usedIds.has(t.id));
  }

  /** ค้นผู้ท้าชิงที่ถูกกติกาหลายทาง (ไม่เลือกให้ยัง) ใช้ร่วมกันทั้งบอทเดินเองและตัวช่วยวิเคราะห์ Best Available Move */
  function collectCandidates(board, rack, isFirstMove, difficulty) {
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.Standard;
    const limit = CANDIDATE_LIMIT[difficulty] || 4;
    let candidates = [];
    if (isFirstMove) {
      const fresh = findFreshEquation(rack, cfg);
      if (fresh) candidates = placeFresh(board, fresh, true, cfg.placementTries, limit);
    } else {
      candidates = attemptExtendLines(board, rack, cfg, limit);
      if (candidates.length < limit) {
        candidates = candidates.concat(attemptCrossAtTile(board, rack, cfg, limit - candidates.length));
      }
      if (candidates.length < limit) {
        candidates = candidates.concat(attemptCrossAtEquals(board, rack, cfg, limit - candidates.length));
      }
    }
    return candidates.filter(Boolean);
  }

  /**
   * ค้นหาการเดินให้บอท คืน { found, coords, tiles, score, equations, mode? } หรือ { found:false }
   * ถ้ามี context (คะแนน/ตาที่เล่น) และโหลด AMATS_BRIDGE ไว้ จะเลือกจากผู้ท้าชิงหลายทาง
   * ตาม Tactical Mode ที่ AMATS แนะนำให้บอท แทนที่จะเลือกจากคะแนนดิบอย่างเดียว
   */
  function findMove(board, rack, isFirstMove, difficulty, context) {
    const candidates = collectCandidates(board, rack, isFirstMove, difficulty);
    if (candidates.length === 0) return { found: false };

    const bridgeReady = typeof AMATS_BRIDGE !== "undefined" && AMATS_BRIDGE.available && context;
    if (!bridgeReady || candidates.length === 1) {
      return { found: true, ...candidates[0] };
    }

    const analysis = AMATS_BRIDGE.analyze({
      board, myScore: context.myScore, oppScore: context.oppScore, turnNumber: context.turnNumber, rack,
    });
    const mode = analysis.recommendation ? analysis.recommendation.primary : "CONTROL";
    let best = candidates[0], bestScore = -Infinity;
    for (const c of candidates) {
      const s = scoreCandidateForMode(c, mode, board, rackAfterMove(rack, c), difficulty);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return { found: true, ...best, amatsMode: mode };
  }

  return { DIFFICULTY, findMove, collectCandidates, premiumCellsClaimed, premiumExposureAfter, rackAfterMove, scoreCandidateForMode, simulateNextTurnValue };
})();
