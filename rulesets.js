/* A-Math Core Rulesets
 * Source of truth:
 * - PRIMARY_70: official primary-school 70-tile set
 * - STANDARD_100: official standard/secondary 100-tile set
 * Keep rule differences here; the game engine must not hard-code a tile set.
 */
const AMATH_RULESETS = (() => {
  const PRIMARY_70 = {
    id: "PRIMARY_70",
    label: "ประถมศึกษา 70 เบี้ย",
    totalTiles: 70,
    rackSize: 8,
    clockMinutes: 20,
    numbers: {
      0:{count:4,points:1}, 1:{count:4,points:1}, 2:{count:4,points:1}, 3:{count:4,points:1},
      4:{count:4,points:2}, 5:{count:3,points:2}, 6:{count:3,points:2}, 7:{count:2,points:2},
      8:{count:3,points:2}, 9:{count:2,points:2}, 10:{count:1,points:3}, 11:{count:1,points:4},
      12:{count:1,points:3}, 13:{count:1,points:6}, 14:{count:1,points:4}, 15:{count:1,points:4},
      16:{count:1,points:4}, 20:{count:1,points:5},
    },
    operators: {
      "+":{count:4,points:2},
      "-":{count:4,points:2},
      "+/-":{count:5,points:1,choices:["+","-"]},
      "×/÷":{count:4,points:1,choices:["×","÷"]},
      "=":{count:8,points:1},
    },
    blank: {
      count:4,
      points:0,
      choices:["0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","20","+","-","×","÷","="],
    },
  };

  const STANDARD_100 = {
    id: "STANDARD_100",
    label: "มาตรฐาน 100 เบี้ย",
    totalTiles: 100,
    rackSize: 8,
    clockMinutes: 22,
    numbers: {
      0:{count:5,points:1}, 1:{count:6,points:1}, 2:{count:6,points:1}, 3:{count:5,points:1},
      4:{count:5,points:2}, 5:{count:4,points:2}, 6:{count:4,points:2}, 7:{count:4,points:2},
      8:{count:4,points:2}, 9:{count:4,points:2}, 10:{count:2,points:3}, 11:{count:1,points:4},
      12:{count:2,points:3}, 13:{count:1,points:6}, 14:{count:1,points:4}, 15:{count:1,points:4},
      16:{count:1,points:4}, 17:{count:1,points:6}, 18:{count:1,points:4}, 19:{count:1,points:7},
      20:{count:1,points:5},
    },
    operators: {
      "+":{count:4,points:2},
      "-":{count:4,points:2},
      "+/-":{count:5,points:1,choices:["+","-"]},
      "×":{count:4,points:2},
      "÷":{count:4,points:2},
      "×/÷":{count:4,points:1,choices:["×","÷"]},
      "=":{count:11,points:1},
    },
    blank: {
      count:4,
      points:0,
      choices:["0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","+","-","×","÷","="],
    },
  };

  const ALL = { PRIMARY_70, STANDARD_100 };

  function tileCount(ruleset) {
    const numberCount = Object.values(ruleset.numbers).reduce((s,d)=>s+d.count,0);
    const operatorCount = Object.values(ruleset.operators).reduce((s,d)=>s+d.count,0);
    return numberCount + operatorCount + ruleset.blank.count;
  }

  // Fail fast if a future edit accidentally changes the official tile totals.
  Object.values(ALL).forEach(r => {
    const actual = tileCount(r);
    if (actual !== r.totalTiles) {
      throw new Error(`Invalid A-Math ruleset ${r.id}: expected ${r.totalTiles} tiles, got ${actual}`);
    }
  });

  return { ...ALL, ALL, tileCount };
})();
