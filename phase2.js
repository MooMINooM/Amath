/* AMATS — Phase 2: Data Analytics. เก็บเกมจริงทีละตา + ปรับเกณฑ์ตัวเลขจากข้อมูลจริง */
const AMATS_PHASE2 = (() => {
  const SETTINGS_KEY = "amats_settings_v1";
  const MATCHES_KEY = "amats_matches_v1";

  const DEFAULT_SETTINGS = { totalTurns: 20, leadSmall: 10, leadBig: 30 };

  function loadSettings() {
    try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
    catch (e) { return { ...DEFAULT_SETTINGS }; }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
  }
  function resetSettings() { saveSettings(DEFAULT_SETTINGS); return { ...DEFAULT_SETTINGS }; }

  function loadMatches() {
    try { return JSON.parse(localStorage.getItem(MATCHES_KEY)) || []; } catch (e) { return []; }
  }
  function saveMatches(m) {
    try { localStorage.setItem(MATCHES_KEY, JSON.stringify(m)); } catch (e) { /* storage unavailable */ }
  }

  /** จัดกลุ่ม GAP จากส่วนต่างคะแนนจริง (เรา − คู่แข่ง) ตามเกณฑ์ที่ปรับได้ */
  function classifyGap(diff, settings) {
    const { leadBig, leadSmall } = settings;
    if (diff >= leadBig) return "นำมาก";
    if (diff >= leadSmall) return "นำเล็กน้อย";
    if (diff > -leadSmall) return "สูสี";
    if (diff > -leadBig) return "ตามเล็กน้อย";
    return "ตามมาก";
  }

  /** จัดกลุ่ม Game Phase จากลำดับตาเทียบกับจำนวนตาทั้งเกม (โดยประมาณ) */
  function classifyPhase(turnNo, totalTurns) {
    const pct = turnNo / totalTurns;
    if (pct <= 0.10) return "Opening";
    if (pct <= 0.30) return "Early Midgame";
    if (pct <= 0.60) return "Midgame";
    if (pct <= 0.85) return "Late Game";
    return "Endgame";
  }

  const RACK_NUMERIC = { Excellent: 5, Good: 4, Stable: 3, Weak: 2, Critical: 1 };

  function computeMatchKPIs(match) {
    const turns = match.turns || [];
    const n = turns.length;
    if (n === 0) return { turnsCount: 0 };
    const sum = (fn) => turns.reduce((s, t) => s + fn(t), 0);
    return { turnsCount: n, avgScore: sum(t => t.ourDelta) / n, avgOppScore: sum(t => t.oppDelta) / n };
  }

  /** รวมสถิติจากทุกเกมที่บันทึกไว้ — ใช้แสดง KPI ตามเอกสาร AMATS ข้อ 12 */
  function computeAggregate(matches) {
    const finished = matches.filter(m => m.result);
    const wins = finished.filter(m => m.result === "win").length;
    const winRate = finished.length ? wins / finished.length : null;
    const allTurns = matches.flatMap(m => m.turns || []);
    const n = allTurns.length;
    if (n === 0) return { winRate, matchesCount: matches.length, turnsCount: 0 };

    const avgScore = allTurns.reduce((s, t) => s + t.ourDelta, 0) / n;
    const avgOppScore = allTurns.reduce((s, t) => s + t.oppDelta, 0) / n;
    const netGainPerTurn = avgScore - avgOppScore;
    const rackAvg = allTurns.reduce((s, t) => s + (RACK_NUMERIC[t.rack] || 0), 0) / n;
    const resetFreq = allTurns.filter(t => t.mode === "RESET").length / n;
    const threatsAllowed = allTurns.filter(t => t.threat === "High" || t.threat === "Critical").length;
    const bonusConversion = allTurns.filter(t => t.bonusUsed).length / n;
    const endgameTurns = allTurns.filter(t => t.phase === "Endgame");
    const endgameEfficiency = endgameTurns.length
      ? endgameTurns.reduce((s, t) => s + (t.ourDelta - t.oppDelta), 0) / endgameTurns.length
      : null;
    const adherence = allTurns.filter(t => t.mode === t.recommendedPrimary).length / n;

    const modeStats = {};
    allTurns.forEach(t => {
      if (!modeStats[t.mode]) modeStats[t.mode] = { count: 0, netGainSum: 0 };
      modeStats[t.mode].count++;
      modeStats[t.mode].netGainSum += (t.ourDelta - t.oppDelta);
    });
    Object.values(modeStats).forEach(s => { s.avgNetGain = s.netGainSum / s.count; });

    return {
      winRate, matchesCount: matches.length, turnsCount: n,
      avgScore, avgOppScore, netGainPerTurn, rackAvg, resetFreq,
      threatsAllowed, bonusConversion, endgameEfficiency, adherence, modeStats,
    };
  }

  function csvEscape(s) {
    s = String(s ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(matches) {
    const header = ["matchId", "opponent", "result", "turnNo", "gap", "phase", "rack", "board", "threat",
      "recommendedPrimary", "recommendedSecondary", "mode", "followedRecommendation",
      "ourDelta", "oppDelta", "netGain", "bonusUsed", "note"];
    const rows = [header.join(",")];
    matches.forEach(m => {
      (m.turns || []).forEach(t => {
        rows.push([
          m.id, csvEscape(m.opponent || ""), m.result || "", t.turnNo, t.gap, t.phase, t.rack, t.board, t.threat,
          t.recommendedPrimary || "", t.recommendedSecondary || "", t.mode, t.mode === t.recommendedPrimary,
          t.ourDelta, t.oppDelta, (t.ourDelta - t.oppDelta), t.bonusUsed, csvEscape(t.note || ""),
        ].join(","));
      });
    });
    return rows.join("\n");
  }

  return {
    DEFAULT_SETTINGS, loadSettings, saveSettings, resetSettings,
    loadMatches, saveMatches,
    classifyGap, classifyPhase, RACK_NUMERIC,
    computeMatchKPIs, computeAggregate, toCSV,
  };
})();
