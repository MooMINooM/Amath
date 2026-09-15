/* AMATS — Phase 4: เรียนรู้ P(win) และรูปแบบการเล่นที่มีประสิทธิภาพจากข้อมูลจริง (Phase 2)
 * หมายเหตุ: นี่คือการประมาณค่าทางสถิติ (empirical win rate + Bayesian smoothing) ไม่ใช่ deep learning —
 * เหมาะกับข้อมูลจริงของผู้เล่นคนเดียวที่มักมีแค่หลักสิบ-ร้อยตา ซึ่งโมเดลซับซ้อนจะ overfit ได้ง่าย
 */
const AMATS_PHASE4 = (() => {
  const MIN_SAMPLE = 5; // จำนวนตัวอย่างขั้นต่ำก่อนถือว่าผลลัพธ์พอเชื่อถือได้
  const PRIOR_WEIGHT = 2; // น้ำหนัก prior (หน่วยเป็นจำนวนตัวอย่างเทียม) ดึงค่าเข้าหา 50% เมื่อข้อมูลน้อย

  function labelWinNumeric(match) {
    if (match.result === "win") return 1;
    if (match.result === "loss") return 0;
    if (match.result === "draw") return 0.5;
    return null;
  }

  /** แปลงทุกตาในทุกเกมที่มีผลแพ้ชนะแล้ว ให้มี label ผลของเกมนั้นติดไปด้วย (ใช้ทั้งเกมเป็นตัวแทนของทุกตาในเกม) */
  function allLabeledTurns(matches) {
    const rows = [];
    matches.forEach(m => {
      const y = labelWinNumeric(m);
      if (y === null) return;
      (m.turns || []).forEach(t => rows.push({ ...t, win: y }));
    });
    return rows;
  }

  function smoothedRate(successSum, n) {
    return (successSum + PRIOR_WEIGHT * 0.5) / (n + PRIOR_WEIGHT);
  }

  function bucketBy(rows, keyFn) {
    const buckets = {};
    rows.forEach(r => {
      const k = keyFn(r);
      if (!buckets[k]) buckets[k] = { n: 0, winSum: 0, netGainSum: 0 };
      buckets[k].n++;
      buckets[k].winSum += r.win;
      buckets[k].netGainSum += (r.ourDelta - r.oppDelta);
    });
    Object.values(buckets).forEach(b => {
      b.winRateRaw = b.winSum / b.n;
      b.winRateSmoothed = smoothedRate(b.winSum, b.n);
      b.avgNetGain = b.netGainSum / b.n;
    });
    return buckets;
  }

  function learnByMode(rows) { return bucketBy(rows, r => r.mode); }
  function learnByGap(rows) { return bucketBy(rows, r => r.gap); }
  function learnByThreat(rows) { return bucketBy(rows, r => r.threat); }
  function learnByGapMode(rows) { return bucketBy(rows, r => r.gap + "␟" + r.mode); }

  /** เทียบโหมดที่ Phase 1 (กฎตายตัว) แนะนำ กับโหมดที่ข้อมูลจริงบอกว่า Net Gain เฉลี่ยดีที่สุด ในแต่ละ GAP */
  function personalizedPlaybook(gapModeBuckets, gapLevels, gapTable) {
    return gapLevels.map(gap => {
      const candidates = Object.entries(gapModeBuckets)
        .filter(([k]) => k.startsWith(gap + "␟"))
        .map(([k, b]) => ({ mode: k.split("␟")[1], ...b }))
        .sort((a, b) => b.avgNetGain - a.avgNetGain);
      const trusted = candidates.filter(c => c.n >= MIN_SAMPLE);
      const ruleMode = gapTable[gap] ? gapTable[gap].primary : null;
      const dataMode = trusted[0] ? trusted[0].mode : null;
      return { gap, ruleMode, dataMode, candidates, agree: dataMode ? dataMode === ruleMode : null };
    });
  }

  /** ทำนาย P(win) ของสถานการณ์ (gap, threat) จากข้อมูลจริง — fallback เป็น GAP อย่างเดียวถ้าคู่ (gap,threat) ข้อมูลน้อยเกิน */
  function predictWinProbability(rows, { gap, threat }) {
    const exact = rows.filter(r => r.gap === gap && r.threat === threat);
    if (exact.length >= MIN_SAMPLE) {
      return { n: exact.length, p: smoothedRate(exact.reduce((s, r) => s + r.win, 0), exact.length), exact: true };
    }
    const byGap = rows.filter(r => r.gap === gap);
    if (byGap.length >= MIN_SAMPLE) {
      return { n: byGap.length, p: smoothedRate(byGap.reduce((s, r) => s + r.win, 0), byGap.length), exact: false };
    }
    return null;
  }

  return {
    MIN_SAMPLE, allLabeledTurns, bucketBy,
    learnByMode, learnByGap, learnByThreat, learnByGapMode,
    personalizedPlaybook, predictWinProbability,
  };
})();
