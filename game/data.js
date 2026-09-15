/* A-Math Game — ข้อมูลกระดานและเบี้ย ยืนยันจากคู่มือกติกาทางการ (100 เบี้ย, 225 ช่อง) */
const AMATH_DATA = (() => {
  const BOARD_SIZE = 15;
  const RACK_SIZE = 8;
  const CENTER = [7, 7]; // 0-indexed — ช่องดาว เป็นช่องสีฟ้า (Triple Piece) ตามกติกาทางการ

  // พิกัดช่องโบนัส [row, col] แบบ 0-indexed
  const TE = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]]; // แดง — คูณทั้งสมการ ×3
  const DE = [[1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
              [1,13],[2,12],[3,11],[4,10],[13,1],[12,2],[11,3],[10,4]]; // เหลือง — คูณทั้งสมการ ×2
  const TP = [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]]; // ฟ้า — คูณเฉพาะเบี้ย ×3
  const DP = [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
              [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]]; // ส้ม — คูณเฉพาะเบี้ย ×2

  const bonusMap = new Map(); // "r,c" -> "TE"|"DE"|"TP"|"DP"
  TE.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "TE"));
  DE.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "DE"));
  TP.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "TP"));
  DP.forEach(([r,c]) => bonusMap.set(`${r},${c}`, "DP"));
  bonusMap.set(`${CENTER[0]},${CENTER[1]}`, "TP"); // ช่องดาว = Triple Piece

  function bonusAt(r, c) {
    return bonusMap.get(`${r},${c}`) || null;
  }
  function isCenter(r, c) {
    return r === CENTER[0] && c === CENTER[1];
  }

  // เบี้ย 100 ใบ ยืนยันจากคู่มือกติกาทางการ
  const NUMBER_TILES = {
    0: { count: 5, points: 1 }, 1: { count: 6, points: 1 }, 2: { count: 6, points: 1 }, 3: { count: 5, points: 1 },
    4: { count: 5, points: 2 }, 5: { count: 4, points: 2 }, 6: { count: 4, points: 2 }, 7: { count: 4, points: 2 },
    8: { count: 4, points: 2 }, 9: { count: 4, points: 2 }, 10: { count: 2, points: 3 }, 11: { count: 1, points: 4 },
    12: { count: 2, points: 3 }, 13: { count: 1, points: 6 }, 14: { count: 1, points: 4 }, 15: { count: 1, points: 4 },
    16: { count: 1, points: 4 }, 17: { count: 1, points: 6 }, 18: { count: 1, points: 4 }, 19: { count: 1, points: 7 },
    20: { count: 1, points: 5 },
  };
  const OPERATOR_TILES = {
    "+": { count: 4, points: 2 },
    "-": { count: 4, points: 2 },
    "+/-": { count: 5, points: 1, choices: ["+", "-"] },
    "×": { count: 4, points: 2 },
    "÷": { count: 4, points: 2 },
    "×/÷": { count: 4, points: 1, choices: ["×", "÷"] },
    "=": { count: 11, points: 1 },
  };
  const BLANK_TILE = { count: 4, points: 0, choices: [..."0123456789".split("")].concat(
    Array.from({length:11}, (_,i)=>String(i+10)), ["+","-","×","÷","="]) };

  function buildBag() {
    const bag = [];
    let seq = 0;
    for (const [num, def] of Object.entries(NUMBER_TILES)) {
      for (let i = 0; i < def.count; i++) bag.push({ id: "t" + (seq++), kind: "number", face: num, points: def.points });
    }
    for (const [sym, def] of Object.entries(OPERATOR_TILES)) {
      for (let i = 0; i < def.count; i++) {
        bag.push({ id: "t" + (seq++), kind: def.choices ? "wildcard-op" : "operator", face: sym, points: def.points, choices: def.choices || null });
      }
    }
    for (let i = 0; i < BLANK_TILE.count; i++) {
      bag.push({ id: "t" + (seq++), kind: "blank", face: "BLANK", points: 0, choices: BLANK_TILE.choices });
    }
    // Fisher-Yates shuffle
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }

  return { BOARD_SIZE, RACK_SIZE, CENTER, bonusAt, isCenter, NUMBER_TILES, OPERATOR_TILES, BLANK_TILE, buildBag };
})();
