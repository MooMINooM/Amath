/* AMATS — ข้อมูลอ้างอิงและตารางกติกาจากเอกสารแนวคิด (Phase 1: Rule-based) */
const AMATS_DATA = (() => {

  const GAP_LEVELS = ["นำมาก", "นำเล็กน้อย", "สูสี", "ตามเล็กน้อย", "ตามมาก"];
  const GAME_PHASES = ["Opening", "Early Midgame", "Midgame", "Late Game", "Endgame"];
  const RACK_LEVELS = ["Excellent", "Good", "Stable", "Weak", "Critical"];
  const BOARD_STATES = ["Open", "Balanced", "Controlled", "Restricted", "Dangerous"];
  const THREAT_LEVELS = ["Low", "Medium", "High", "Critical"];

  const MODES = {
    PRESS: {
      key: "PRESS", color: "#e63946",
      tagline: "เร่งคะแนน",
      desc: "โหมดเร่งคะแนน ใช้เมื่อต้องลดช่องว่างคะแนนหรือมีโอกาสทำคะแนนก้อนใหญ่ โดยเพิ่มน้ำหนักให้ Score, Bonus และ Tempo แต่ต้องยอมรับ Board Risk ที่สูงขึ้น",
      useWhen: "ตามคะแนน, เหลือเกมไม่มาก, มีช่องโบนัสเข้าถึงได้",
      avoidWhen: "นำมากและเกมใกล้จบ เพราะเพิ่มความผันผวนโดยไม่จำเป็น",
      style: "ใช้โบนัสมากขึ้น ใช้เบี้ยมากขึ้น ยอมรับความเสี่ยงสูงขึ้น",
    },
    BUILD: {
      key: "BUILD", color: "#2a9d8f",
      tagline: "สร้างจังหวะ",
      desc: "โหมดสร้างจังหวะ ใช้การเดินปัจจุบันเป็น “ฐาน” ให้ตาถัดไปดีขึ้น เช่น เปิดทางให้ตัวเองเข้าช่องสำคัญ หรือจัดเบี้ยค้างให้สมดุล (Turn 1 + Turn 2 > Best Turn 1)",
      useWhen: "ตานี้ยังไม่คุ้ม แต่สร้างตาถัดไปได้",
      avoidWhen: "เมื่อ GAP ตามมากและเวลาเหลือน้อย ควรเร่งคะแนนแทน",
      style: "ยอมคะแนนปัจจุบันบางส่วนเพื่อสร้างทางคะแนนหรือพื้นที่ในอนาคต",
    },
    CONTROL: {
      key: "CONTROL", color: "#457b9d",
      tagline: "คุมกระดาน",
      desc: "โหมดคุมสถานการณ์ เน้นความสมดุลระหว่างคะแนนกับตำแหน่ง กระดานควรมีทางสำหรับเราแต่ไม่เอื้อต่อคู่แข่งมากเกินไป เหมาะกับเกมสูสีและช่วงกลางเกม",
      useWhen: "สูสี / เริ่มได้เปรียบ",
      avoidWhen: "เมื่อคู่แข่งมี Threat ระดับ Critical ที่ต้องตัดทันที",
      style: "รักษาจุดเชื่อมสำคัญ จำกัดพื้นที่คู่แข่ง สมดุลรุก-รับ",
    },
    DENY: {
      key: "DENY", color: "#9d4edd",
      tagline: "ตัดโอกาส",
      desc: "โหมดป้องกันเชิงรุก ยอมลดคะแนนของเราบางส่วนเพื่อทำลาย Threat ของคู่แข่ง แนวคิดสำคัญคือ “คะแนนที่ป้องกันไม่ให้คู่แข่งได้” มีคุณค่าต่อผลต่างคะแนนเช่นเดียวกับคะแนนที่เราทำเพิ่ม",
      useWhen: "คู่แข่งมี Threat ชัดเจน",
      avoidWhen: "เมื่อคู่แข่งไม่มี Threat ที่คุ้มจะเสียคะแนนของเราไปปิด",
      style: "ปิดโบนัส ปิดทาง ลดคะแนนที่คู่แข่งน่าจะทำได้",
    },
    GUARD: {
      key: "GUARD", color: "#588157",
      tagline: "รักษาความได้เปรียบ",
      desc: "โหมดรักษาความได้เปรียบ เป้าหมายเปลี่ยนจาก Maximize Score เป็น Maximize Win Probability เน้นเล่นให้ปลอดภัย ลดช่องทางทำคะแนนก้อนใหญ่ของคู่แข่ง และจัดเบี้ยให้จบเกมได้ง่าย",
      useWhen: "นำคะแนน / ช่วงท้าย",
      avoidWhen: "เมื่อยังตามคะแนนอยู่ ยังไม่ถึงจุดที่ต้องรักษาความได้เปรียบ",
      style: "ลดความผันผวน ไม่เปิดช่องใหญ่ บังคับให้คู่แข่งเป็นฝ่ายเสี่ยง",
    },
    RESET: {
      key: "RESET", color: "#e07a5f",
      tagline: "ปรับมือ",
      desc: "โหมดแก้คุณภาพมือ เมื่อ Rack Health ต่ำหรือทางเลือกแคบมาก การยอมเสียจังหวะเพื่อปรับเบี้ยอาจคุ้มกว่าฝืนลงคะแนนต่ำต่อเนื่อง",
      useWhen: "มือแย่ / ทางเล่นน้อย / เกมยังเหลือ",
      avoidWhen: "เมื่อเกมใกล้จบมากจนไม่มีตาเหลือให้ใช้ประโยชน์จากมือที่ปรับแล้ว",
      style: "ยอมเสียจังหวะระยะสั้น เพื่อเพิ่มคุณภาพมือระยะยาว",
    },
  };

  // ตาราง: สถานการณ์ (GAP) → โหมดหลัก / โหมดรอง
  const GAP_TABLE = {
    "ตามมาก": { primary: "PRESS", secondary: "BUILD" },
    "ตามเล็กน้อย": { primary: "PRESS", secondary: "CONTROL" },
    "สูสี": { primary: "CONTROL", secondary: "BUILD" },
    "นำเล็กน้อย": { primary: "CONTROL", secondary: "DENY" },
    "นำมาก": { primary: "GUARD", secondary: "DENY" },
  };

  // ตาราง: สถานการณ์ → Risk ที่เหมาะสม → หลักคิด
  const RISK_TABLE = {
    "นำมาก": { risk: "Low", note: "ลดความผันผวน รักษาผลต่าง" },
    "นำเล็กน้อย": { risk: "Low–Medium", note: "คุมเกมและปิด Threat" },
    "สูสี": { risk: "Medium", note: "สมดุลคะแนน-ตำแหน่ง-มือ" },
    "ตามเล็กน้อย": { risk: "Medium–High", note: "เพิ่ม Pace แต่ยังคุมความเสี่ยง" },
    "ตามมาก": { risk: "High–Extreme", note: "เพิ่มความผันผวนเพื่อสร้างโอกาสพลิกเกม" },
  };

  const RACK_TABLE = {
    Excellent: { desc: "สมดุล สร้างสมการได้หลายแบบ มีทางต่อยอด", advice: "PRESS / BUILD ได้เมื่อเหมาะสม" },
    Good: { desc: "มีทางเลือกหลายทาง ปัญหาน้อย", advice: "เล่นตาม Game State" },
    Stable: { desc: "พอใช้ มีข้อจำกัดบางส่วน", advice: "CONTROL และจัดมือควบคู่" },
    Weak: { desc: "ตัวเลือกน้อย มีเบี้ยติดมือ", advice: "หา BUILD หรือเตรียม RESET" },
    Critical: { desc: "แทบไม่มีการเดินคุ้มค่า", advice: "พิจารณา RESET หากช่วงเกมเอื้อ" },
  };

  const ZONE_TABLE = [
    { zone: "High-Value Zone", meaning: "ช่องโบนัส/พื้นที่คะแนนสูง", note: "ใช้เมื่อคุ้ม แต่ต้องประเมิน Counter" },
    { zone: "Access Zone", meaning: "ทางเชื่อมไปยัง High-Value Zone", note: "ครองไว้เพื่อสร้างตัวเลือกในอนาคต" },
    { zone: "Neutral Zone", meaning: "พื้นที่ทั่วไป", note: "ใช้เพื่อจัดเกมและรักษา Rack" },
    { zone: "Danger Zone", meaning: "พื้นที่ที่เปิดช่องใหญ่ให้คู่แข่ง", note: "หลีกเลี่ยงหรือใช้ DENY/CONTROL" },
  ];

  const THREAT_TYPES = [
    { name: "Immediate Threat", desc: "คู่แข่งมีทางทำคะแนนสูงในตาถัดไปทันที" },
    { name: "Position Threat", desc: "คู่แข่งกำลังจะครองทางเชื่อมหรือพื้นที่สำคัญ" },
    { name: "Future Threat", desc: "การเดินปัจจุบันจะสร้างจุดอันตรายในอีก 1–2 ตาหรือไม่" },
  ];

  const PLAYER_PROFILES = [
    { name: "Aggressive Player", strength: "ทำคะแนนก้อนใหญ่และสร้าง Pace สูง", watch: "เปิด Board Risk และ Rack เสื่อมเร็ว" },
    { name: "Control Player", strength: "คุมกระดานและลดคะแนนคู่แข่ง", watch: "อาจพลาดโอกาสทำคะแนนก้อนใหญ่" },
    { name: "Consistent Player", strength: "คะแนนต่อ Turn เสถียร", watch: "อาจขาดจังหวะพลิกเกมเมื่อตาม" },
    { name: "Tactical Player", strength: "เปลี่ยน Mode ตามสถานการณ์ได้ดี", watch: "ต้องอาศัยการอ่านเกมและข้อมูล" },
    { name: "Endgame Player", strength: "ปิดเกมและบริหารความได้เปรียบดี", watch: "ต้องมีวินัยสูงในช่วงต้น-กลางเกม" },
  ];

  const TRAINING_LEVELS = [
    { level: 1, name: "Score Recognition", goal: "หา Move ที่ให้คะแนนดี", activity: "โจทย์กระดานกำหนดเวลา หา 3 ทางเลือกและเรียงคะแนน" },
    { level: 2, name: "Board Awareness", goal: "มองพื้นที่และ Counter", activity: "ให้ผู้เล่นอธิบายว่าการเดินหนึ่งครั้งเปิด/ปิดพื้นที่ใด" },
    { level: 3, name: "Tactical Choice", goal: "เลือก Tactical Mode ให้เหมาะสถานการณ์", activity: "โจทย์ GAP + Phase + Rack แล้วเลือก PRESS/CONTROL ฯลฯ" },
    { level: 4, name: "Strategic Simulation", goal: "คิด 2–3 Turn ล่วงหน้า", activity: "เล่นสถานการณ์จำลองและบังคับอธิบาย Move → Counter → Next Move" },
  ];

  const SRBTG = [
    { code: "S", name: "Score", question: "ตานี้ได้เท่าไร และคุ้มกับสถานการณ์หรือไม่?" },
    { code: "R", name: "Rack", question: "หลังลงแล้ว Rack Health ดีขึ้นหรือแย่ลง?" },
    { code: "B", name: "Board", question: "เราได้พื้นที่หรือเปิดพื้นที่ให้คู่แข่ง?" },
    { code: "T", name: "Threat", question: "คู่แข่งมี Counter หรือ Threat ระดับใด?" },
    { code: "G", name: "Game State", question: "GAP และช่วงเกมบอกให้เราใช้ Mode ใด?" },
  ];

  const RACK_CHECK_QUESTIONS = [
    { id: "variety", text: "เบี้ยในมือหลากหลายพอสร้างสมการได้หลายแบบ ไม่ใช่กระจุกตัวแบบเดียว", weight: 1 },
    { id: "operators", text: "มีตัวดำเนินการ (+ − × ÷ =) สมดุล ไม่ขาดหรือเกินจนใช้ไม่ได้", weight: 1 },
    { id: "connect", text: "มีเบี้ยที่เชื่อมกับกระดานปัจจุบันได้ง่าย ไม่ใช่ต้องรอช่องเฉพาะ", weight: 1 },
    { id: "stuck", text: "ไม่มีเบี้ยค้างมือที่ใช้ยากจำนวนมากเกินไป", weight: 1 },
    { id: "flex", text: "มีเบี้ยยืดหยุ่นสูง (เช่นเลขที่ใช้ได้หลายสมการ หรือบลังค์) อย่างน้อยหนึ่งตัว", weight: 1 },
  ];

  // สถานการณ์ฝึกซ้อม สำหรับ Level 3 (Tactical Choice) — คำตอบคำนวณจาก rule engine ตอนรันจริง
  const PRACTICE_SCENARIOS = [
    { gap: "ตามมาก", phase: "Late Game", rack: "Stable", board: "Open", threat: "Low",
      story: "เหลืออีก 4 ตาจบเกม เราตามอยู่ 45 แต้ม มือพอใช้ กระดานยังเปิดกว้าง คู่แข่งยังไม่มีท่าอันตรายชัดเจน" },
    { gap: "นำมาก", phase: "Late Game", rack: "Good", board: "Balanced", threat: "Medium",
      story: "เรานำอยู่ 60 แต้ม เหลือ 3 ตาจบเกม มือดี กระดานสมดุล คู่แข่งพอมีช่องทำคะแนนได้บ้าง" },
    { gap: "สูสี", phase: "Midgame", rack: "Good", board: "Balanced", threat: "Medium",
      story: "คะแนนห่างกันแค่ 8 แต้ม อยู่กลางเกม มือดี กระดานสมดุล คู่แข่งมีโอกาสทำคะแนนปานกลาง" },
    { gap: "นำเล็กน้อย", phase: "Midgame", rack: "Stable", board: "Controlled", threat: "Low",
      story: "เรานำอยู่ 12 แต้ม กลางเกม มือพอใช้ กระดานเราคุมได้ระดับหนึ่ง คู่แข่งยังไม่มีท่าไม้ตาย" },
    { gap: "ตามเล็กน้อย", phase: "Early Midgame", rack: "Good", board: "Open", threat: "Low",
      story: "ตามอยู่ 15 แต้ม ช่วงต้นเกม มือดี กระดานยังเปิด มีช่องโบนัสให้เข้าถึงได้" },
    { gap: "สูสี", phase: "Midgame", rack: "Critical", board: "Restricted", threat: "Medium",
      story: "คะแนนสูสีกัน แต่มือเราแทบไม่มีทางเดินที่คุ้มค่าเลย กระดานก็เริ่มถูกจำกัด" },
    { gap: "นำเล็กน้อย", phase: "Late Game", rack: "Good", board: "Dangerous", threat: "Critical",
      story: "เรานำเล็กน้อย แต่คู่แข่งเพิ่งเปิดช่องให้ตัวเองทำคะแนนก้อนใหญ่ได้ทันทีในตาถัดไป" },
    { gap: "ตามมาก", phase: "Endgame", rack: "Weak", board: "Restricted", threat: "High",
      story: "ใกล้จบเกมแล้วและยังตามอยู่มาก มือเริ่มแย่ กระดานถูกจำกัด คู่แข่งก็มีท่าอันตรายรออยู่" },
    { gap: "สูสี", phase: "Opening", rack: "Excellent", board: "Open", threat: "Low",
      story: "เพิ่งเริ่มเกม คะแนนสูสี มือดีมาก กระดานยังเปิดโล่ง ยังไม่มีอะไรน่ากังวล" },
    { gap: "นำมาก", phase: "Endgame", rack: "Stable", board: "Balanced", threat: "Low",
      story: "นำห่างและใกล้จบเกมแล้ว มือพอใช้ กระดานสมดุล คู่แข่งไม่มีทางเดินอันตราย" },
    { gap: "ตามเล็กน้อย", phase: "Midgame", rack: "Weak", board: "Balanced", threat: "Medium",
      story: "ตามอยู่เล็กน้อยกลางเกม แต่มือเริ่มอ่อนแรงและทางเลือกแคบลง" },
    { gap: "นำเล็กน้อย", phase: "Early Midgame", rack: "Good", board: "Open", threat: "High",
      story: "นำอยู่เล็กน้อยในช่วงต้นเกม มือดี แต่คู่แข่งเริ่มมีช่องทางทำคะแนนสูงที่ต้องระวัง" },
  ];

  return {
    GAP_LEVELS, GAME_PHASES, RACK_LEVELS, BOARD_STATES, THREAT_LEVELS,
    MODES, GAP_TABLE, RISK_TABLE, RACK_TABLE, ZONE_TABLE, THREAT_TYPES,
    PLAYER_PROFILES, TRAINING_LEVELS, SRBTG, RACK_CHECK_QUESTIONS, PRACTICE_SCENARIOS,
  };
})();
