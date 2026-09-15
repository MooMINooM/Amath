/* AMATS — App logic: tabs, forms, log storage */
(() => {
  const D = AMATS_DATA;
  const E = AMATS_ENGINE;
  const LOG_KEY = "amats_log_v1";

  /* ---------- storage ---------- */
  function loadLog() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveLog(entries) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(entries));
    } catch (e) { /* storage unavailable — ignore, app still works without history */ }
  }
  function addLogEntry(entry) {
    const log = loadLog();
    log.unshift({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), ts: Date.now(), ...entry });
    saveLog(log);
    renderHistoryTab();
    renderDashboardTab();
  }

  /* ---------- small helpers ---------- */
  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(c) : c);
    }
    return node;
  }
  function optionList(values, selected) {
    return values.map(v => `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`).join("");
  }
  function modeBadge(key, size = "md") {
    const m = D.MODES[key];
    return `<span class="badge badge-${size}" style="background:${m.color}">${key}</span>`;
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function downloadCSV(filename, csvText) {
    const blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ================= TABS ================= */
  const TABS = [
    { id: "dashboard", label: "หน้าหลัก" },
    { id: "advisor", label: "Tactical Advisor" },
    { id: "moves", label: "Move Comparator" },
    { id: "simulator", label: "Simulator" },
    { id: "rack", label: "Rack Health" },
    { id: "checklist", label: "S-R-B-T-G" },
    { id: "practice", label: "ฝึกซ้อม" },
    { id: "match", label: "บันทึกเกม" },
    { id: "analytics", label: "วิเคราะห์ข้อมูล" },
    { id: "history", label: "ประวัติ/สถิติ" },
    { id: "playbook", label: "Playbook" },
  ];

  function initTabs() {
    const nav = document.getElementById("tabnav");
    TABS.forEach(t => {
      const btn = h("button", { class: "tabbtn", "data-tab": t.id, onclick: () => showTab(t.id) }, t.label);
      nav.appendChild(btn);
    });
    showTab("dashboard");
  }
  function showTab(id) {
    document.querySelectorAll(".tabpanel").forEach(p => p.classList.toggle("active", p.id === "panel-" + id));
    document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================= DASHBOARD ================= */
  function renderDashboardTab() {
    const panel = document.getElementById("panel-dashboard");
    const log = loadLog();
    const practiceL3 = log.filter(e => e.type === "practice" && e.level === 3);
    const accuracy = practiceL3.length
      ? Math.round(100 * practiceL3.filter(e => e.result === "correct").length / practiceL3.length)
      : null;
    const modeCounts = {};
    log.forEach(e => { if (e.mode) modeCounts[e.mode] = (modeCounts[e.mode] || 0) + 1; });
    const topModes = Object.entries(modeCounts).sort((a, b) => b[1] - a[1]);
    const matches = AMATS_PHASE2.loadMatches();
    const agg = AMATS_PHASE2.computeAggregate(matches);

    panel.innerHTML = `
      <h2>AMATS — A-Math Tactical System</h2>
      <p class="lead">โปรแกรมฝึกซ้อมและช่วยตัดสินใจเชิงกลยุทธ์สำหรับ A-Math ตามแนวคิด Phase 1: Rule-based —
      รับสถานการณ์ → วิเคราะห์ → แนะนำ Tactical Mode → บันทึกผล → วิเคราะห์ย้อนหลัง</p>

      <div class="formula-box">
        <div>Move Value = Score + Position + Rack + Denial − Opponent Opportunity</div>
        <div>Net Gain = Our Score − Expected Opponent Score</div>
      </div>

      <h3>6 Tactical Modes</h3>
      <div class="mode-grid">
        ${Object.values(D.MODES).map(m => `
          <div class="mode-card" style="border-color:${m.color}">
            <div class="mode-card-head" style="background:${m.color}">${m.key} — ${m.tagline}</div>
            <div class="mode-card-body">${m.desc}</div>
          </div>
        `).join("")}
      </div>

      <h3>สรุปการฝึกของคุณ</h3>
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-num">${log.length}</div><div class="kpi-label">บันทึกทั้งหมด</div></div>
        <div class="kpi"><div class="kpi-num">${practiceL3.length}</div><div class="kpi-label">โจทย์ Tactical Choice ที่ทำ</div></div>
        <div class="kpi"><div class="kpi-num">${accuracy === null ? "—" : accuracy + "%"}</div><div class="kpi-label">ความแม่นยำ Tactical Choice</div></div>
        <div class="kpi"><div class="kpi-num">${matches.length}</div><div class="kpi-label">เกมจริงที่บันทึก (Phase 2)</div></div>
        <div class="kpi"><div class="kpi-num">${agg.winRate === null ? "—" : Math.round(agg.winRate * 100) + "%"}</div><div class="kpi-label">Win Rate</div></div>
      </div>
      ${topModes.length ? `
        <div class="mode-usage">
          ${topModes.map(([k, c]) => `<div class="usage-bar-row"><span>${modeBadge(k, "sm")}</span>
            <div class="usage-bar-track"><div class="usage-bar-fill" style="width:${Math.round(100 * c / topModes[0][1])}%;background:${D.MODES[k].color}"></div></div>
            <span class="usage-count">${c}</span></div>`).join("")}
        </div>` : `<p class="muted">ยังไม่มีข้อมูลการใช้งาน ลองเริ่มที่แท็บ Tactical Advisor หรือ ฝึกซ้อม</p>`}
    `;
  }

  /* ================= TACTICAL ADVISOR ================= */
  function renderAdvisorTab() {
    const panel = document.getElementById("panel-advisor");
    panel.innerHTML = `
      <h2>Tactical Advisor</h2>
      <p class="lead">กรอก Game State ปัจจุบันเพื่อรับคำแนะนำ Tactical Mode ตามกฎของ AMATS</p>
      <form id="advisor-form" class="form-grid">
        <label>GAP (เรานำหรือตาม)<select name="gap">${optionList(D.GAP_LEVELS, "สูสี")}</select></label>
        <label>Game Phase<select name="phase">${optionList(D.GAME_PHASES, "Midgame")}</select></label>
        <label>Rack Health<select name="rack">${optionList(D.RACK_LEVELS, "Good")}</select></label>
        <label>Board State<select name="board">${optionList(D.BOARD_STATES, "Balanced")}</select></label>
        <label>Threat Level<select name="threat">${optionList(D.THREAT_LEVELS, "Low")}</select></label>
        <button type="submit" class="btn-primary">วิเคราะห์</button>
      </form>
      <div id="advisor-result"></div>
    `;
    const form = document.getElementById("advisor-form");
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const state = { gap: fd.get("gap"), phase: fd.get("phase"), rack: fd.get("rack"), board: fd.get("board"), threat: fd.get("threat") };
      const rec = E.recommendMode(state);
      const resultBox = document.getElementById("advisor-result");
      resultBox.innerHTML = `
        <div class="result-card">
          <div class="result-modes">
            <div>โหมดหลัก ${modeBadge(rec.primary, "lg")}</div>
            <div>โหมดรอง ${modeBadge(rec.secondary, "lg")}</div>
          </div>
          <ul class="reasons">${rec.reasons.map(r => `<li>${r}</li>`).join("")}</ul>
          ${rec.risk ? `<p class="risk-note"><strong>Risk ที่เหมาะสม:</strong> ${rec.risk.risk} — ${rec.risk.note}</p>` : ""}
          <button id="advisor-save" class="btn-secondary">บันทึกลงประวัติ</button>
        </div>
      `;
      document.getElementById("advisor-save").addEventListener("click", () => {
        addLogEntry({ type: "advisor", state, mode: rec.primary, secondary: rec.secondary, reasons: rec.reasons });
        document.getElementById("advisor-save").textContent = "บันทึกแล้ว ✓";
        document.getElementById("advisor-save").disabled = true;
      });
    });
  }

  /* ================= MOVE COMPARATOR ================= */
  let moveRows = [];
  function newMoveRow(label) {
    return { id: Math.random().toString(36).slice(2, 8), label, score: 0, position: 0, rack: 0, denial: 0, oppOpp: 0, expOpp: 0 };
  }
  function renderMoveComparatorTab() {
    if (moveRows.length === 0) moveRows = [newMoveRow("Move A"), newMoveRow("Move B")];
    const panel = document.getElementById("panel-moves");
    panel.innerHTML = `
      <h2>Move Comparator</h2>
      <p class="lead">เปรียบเทียบทางเลือกการเดินด้วย Move Value และ Net Gain — คะแนนสูงสุดไม่จำเป็นต้องเป็นทางเลือกที่ดีที่สุดเสมอไป</p>
      <div class="table-wrap"><table id="move-table" class="data-table"></table></div>
      <div class="row-actions">
        <button id="move-add" class="btn-secondary">+ เพิ่มทางเลือก</button>
        <button id="move-save" class="btn-primary">บันทึกผลเปรียบเทียบ</button>
      </div>
    `;
    document.getElementById("move-add").addEventListener("click", () => {
      if (moveRows.length >= 5) return;
      moveRows.push(newMoveRow("Move " + String.fromCharCode(65 + moveRows.length)));
      renderMoveTable();
    });
    document.getElementById("move-save").addEventListener("click", () => {
      const computed = moveRows.map(r => ({ ...r, value: E.moveValue({ score: r.score, position: r.position, rack: r.rack, denial: r.denial, opponentOpportunity: r.oppOpp }), net: E.netGain(r.score, r.expOpp) }));
      addLogEntry({ type: "move", rows: computed });
      const btn = document.getElementById("move-save");
      btn.textContent = "บันทึกแล้ว ✓";
      setTimeout(() => { btn.textContent = "บันทึกผลเปรียบเทียบ"; }, 1500);
    });
    renderMoveTable();
  }
  function renderMoveTable() {
    const table = document.getElementById("move-table");
    const computed = moveRows.map(r => ({ ...r, value: E.moveValue({ score: r.score, position: r.position, rack: r.rack, denial: r.denial, opponentOpportunity: r.oppOpp }), net: E.netGain(r.score, r.expOpp) }));
    const bestValue = Math.max(...computed.map(r => r.value));
    table.innerHTML = `
      <thead><tr>
        <th>ทางเลือก</th><th>Score</th><th>Position</th><th>Rack</th><th>Denial</th>
        <th>Opp. Opportunity</th><th>คาดคะแนนคู่แข่ง</th><th>Move Value</th><th>Net Gain</th><th></th>
      </tr></thead>
      <tbody>
        ${computed.map((r, i) => `
          <tr class="${r.value === bestValue ? "best-row" : ""}">
            <td><input data-idx="${i}" data-field="label" value="${r.label}" class="cell-text"></td>
            <td><input type="number" data-idx="${i}" data-field="score" value="${r.score}" class="cell-num"></td>
            <td><input type="number" data-idx="${i}" data-field="position" value="${r.position}" class="cell-num"></td>
            <td><input type="number" data-idx="${i}" data-field="rack" value="${r.rack}" class="cell-num"></td>
            <td><input type="number" data-idx="${i}" data-field="denial" value="${r.denial}" class="cell-num"></td>
            <td><input type="number" data-idx="${i}" data-field="oppOpp" value="${r.oppOpp}" class="cell-num"></td>
            <td><input type="number" data-idx="${i}" data-field="expOpp" value="${r.expOpp}" class="cell-num"></td>
            <td class="value-cell">${r.value}</td>
            <td>${r.net}</td>
            <td>${moveRows.length > 1 ? `<button class="row-del" data-idx="${i}">✕</button>` : ""}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
    table.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        const idx = +inp.dataset.idx, field = inp.dataset.field;
        moveRows[idx][field] = field === "label" ? inp.value : (parseFloat(inp.value) || 0);
        renderMoveTable();
        // restore focus after re-render
        const again = table.querySelector(`input[data-idx="${idx}"][data-field="${field}"]`);
        if (again) { again.focus(); if (again.type !== "number") again.setSelectionRange(again.value.length, again.value.length); }
      });
    });
    table.querySelectorAll(".row-del").forEach(btn => {
      btn.addEventListener("click", () => { moveRows.splice(+btn.dataset.idx, 1); renderMoveTable(); });
    });
  }

  /* ================= SIMULATOR (Phase 3: 2-Turn Expected Value) ================= */
  let simMoves = [];
  function newBranch(label) { return { label, prob: 50, oppScore: 15, nextMoveValue: 20 }; }
  function newSimMove(label) { return { label, score: 20, position: 0, rack: 0, denial: 0, oppOpp: 0, branches: [newBranch("Response 1"), newBranch("Response 2")] }; }
  function computeSimMove(m) {
    const immediate = E.moveValue({ score: m.score, position: m.position, rack: m.rack, denial: m.denial, opponentOpportunity: m.oppOpp });
    const probSum = m.branches.reduce((s, b) => s + b.prob, 0);
    const ev = E.twoTurnExpectedValue(immediate, m.branches);
    return { ...m, immediate, probSum, ev };
  }

  function renderSimulatorTab() {
    if (simMoves.length === 0) simMoves = [newSimMove("Move A"), newSimMove("Move B")];
    const panel = document.getElementById("panel-simulator");
    panel.innerHTML = `
      <h2>Simulator — จำลอง 2 Turn ล่วงหน้า</h2>
      <p class="lead">Our Move → Opponent Response (หลายทางถ่วงน้ำหนักด้วยความน่าจะเป็น) → Our Next Move —
      เปรียบเทียบ Expected Value ของแต่ละทางเลือกตานี้ โดยคิดรวมการตอบโต้ของคู่แข่งด้วย ไม่ใช่แค่คะแนนตาเดียว</p>
      <div id="sim-body"></div>
      <div class="row-actions">
        <button id="sim-add-move" class="btn-secondary">+ เพิ่มทางเลือกตานี้</button>
        <button id="sim-save" class="btn-primary">บันทึกผลจำลอง</button>
      </div>
    `;
    document.getElementById("sim-add-move").addEventListener("click", () => {
      if (simMoves.length >= 3) return;
      simMoves.push(newSimMove("Move " + String.fromCharCode(65 + simMoves.length)));
      renderSimBody();
    });
    document.getElementById("sim-save").addEventListener("click", () => {
      addLogEntry({ type: "simulation", moves: simMoves.map(computeSimMove) });
      const btn = document.getElementById("sim-save");
      btn.textContent = "บันทึกแล้ว ✓";
      setTimeout(() => { btn.textContent = "บันทึกผลจำลอง"; }, 1500);
    });
    renderSimBody();
  }

  function renderSimBody() {
    const body = document.getElementById("sim-body");
    const computed = simMoves.map(computeSimMove);
    const bestEV = Math.max(...computed.map(c => c.ev));
    body.innerHTML = computed.map((m, mi) => `
      <div class="sim-card ${m.ev === bestEV ? "sim-best" : ""}">
        <div class="sim-card-head">
          <input class="cell-text sim-label" data-mi="${mi}" value="${m.label}">
          ${simMoves.length > 1 ? `<button class="row-del sim-move-del" data-mi="${mi}">✕</button>` : ""}
        </div>
        <div class="sim-immediate-grid">
          <label>Score<input type="number" class="cell-num sim-field" data-mi="${mi}" data-field="score" value="${m.score}"></label>
          <label>Position<input type="number" class="cell-num sim-field" data-mi="${mi}" data-field="position" value="${m.position}"></label>
          <label>Rack<input type="number" class="cell-num sim-field" data-mi="${mi}" data-field="rack" value="${m.rack}"></label>
          <label>Denial<input type="number" class="cell-num sim-field" data-mi="${mi}" data-field="denial" value="${m.denial}"></label>
          <label>Opp. Opportunity<input type="number" class="cell-num sim-field" data-mi="${mi}" data-field="oppOpp" value="${m.oppOpp}"></label>
        </div>
        <div class="sim-immediate-value">Move Value ตานี้: <strong>${m.immediate}</strong></div>

        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>การตอบของคู่แข่ง</th><th>โอกาส (%)</th><th>คะแนนคู่แข่งตานั้น</th><th>Our Next Move (ประมาณ)</th><th>ผลตอบแทนกิ่งนี้</th><th></th></tr></thead>
          <tbody>${m.branches.map((b, bi) => `
            <tr>
              <td><input class="cell-text sim-branch-field" data-mi="${mi}" data-bi="${bi}" data-field="label" value="${b.label}"></td>
              <td><input type="number" class="cell-num sim-branch-field" data-mi="${mi}" data-bi="${bi}" data-field="prob" value="${b.prob}"></td>
              <td><input type="number" class="cell-num sim-branch-field" data-mi="${mi}" data-bi="${bi}" data-field="oppScore" value="${b.oppScore}"></td>
              <td><input type="number" class="cell-num sim-branch-field" data-mi="${mi}" data-bi="${bi}" data-field="nextMoveValue" value="${b.nextMoveValue}"></td>
              <td>${b.nextMoveValue - b.oppScore}</td>
              <td>${m.branches.length > 1 ? `<button class="row-del sim-branch-del" data-mi="${mi}" data-bi="${bi}">✕</button>` : ""}</td>
            </tr>
          `).join("")}</tbody>
        </table></div>
        <div class="row-actions">
          <button class="btn-secondary sim-branch-add" data-mi="${mi}">+ เพิ่มการตอบ</button>
          <span class="${m.probSum !== 100 ? "prob-warn" : "muted"}">รวมความน่าจะเป็น: ${m.probSum}%${m.probSum !== 100 ? " (ควรรวมให้ได้ 100%)" : ""}</span>
        </div>
        <div class="sim-ev">Expected Value รวม 2 ตา: <strong>${m.ev.toFixed(1)}</strong></div>
      </div>
    `).join("");

    body.querySelectorAll(".sim-label").forEach(inp => {
      inp.addEventListener("input", () => {
        const mi = +inp.dataset.mi;
        simMoves[mi].label = inp.value;
        renderSimBody();
        const again = document.querySelector(`.sim-label[data-mi="${mi}"]`);
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      });
    });
    body.querySelectorAll(".sim-field").forEach(inp => {
      inp.addEventListener("input", () => {
        const mi = +inp.dataset.mi, field = inp.dataset.field;
        simMoves[mi][field] = parseFloat(inp.value) || 0;
        renderSimBody();
        const again = document.querySelector(`.sim-field[data-mi="${mi}"][data-field="${field}"]`);
        if (again) again.focus();
      });
    });
    body.querySelectorAll(".sim-branch-field").forEach(inp => {
      inp.addEventListener("input", () => {
        const mi = +inp.dataset.mi, bi = +inp.dataset.bi, field = inp.dataset.field;
        simMoves[mi].branches[bi][field] = field === "label" ? inp.value : (parseFloat(inp.value) || 0);
        renderSimBody();
        const again = document.querySelector(`.sim-branch-field[data-mi="${mi}"][data-bi="${bi}"][data-field="${field}"]`);
        if (again) { again.focus(); if (again.type !== "number") again.setSelectionRange(again.value.length, again.value.length); }
      });
    });
    body.querySelectorAll(".sim-move-del").forEach(btn => {
      btn.addEventListener("click", () => { simMoves.splice(+btn.dataset.mi, 1); renderSimBody(); });
    });
    body.querySelectorAll(".sim-branch-del").forEach(btn => {
      btn.addEventListener("click", () => { simMoves[+btn.dataset.mi].branches.splice(+btn.dataset.bi, 1); renderSimBody(); });
    });
    body.querySelectorAll(".sim-branch-add").forEach(btn => {
      btn.addEventListener("click", () => {
        const mi = +btn.dataset.mi;
        if (simMoves[mi].branches.length >= 3) return;
        simMoves[mi].branches.push(newBranch("Response " + (simMoves[mi].branches.length + 1)));
        renderSimBody();
      });
    });
  }

  /* ================= RACK HEALTH ================= */
  function renderRackTab() {
    const panel = document.getElementById("panel-rack");
    panel.innerHTML = `
      <h2>Rack Health Self-Check</h2>
      <p class="lead">Rack Health ไม่ได้หมายถึงมีเบี้ยมูลค่าสูง แต่หมายถึงความสามารถสร้างทางเลือกที่ดีได้หลายแบบ</p>
      <form id="rack-form">
        ${D.RACK_CHECK_QUESTIONS.map(q => `
          <label class="check-row"><input type="checkbox" name="${q.id}"> ${q.text}</label>
        `).join("")}
        <button type="submit" class="btn-primary">ประเมิน</button>
      </form>
      <div id="rack-result"></div>
    `;
    document.getElementById("rack-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const answers = {};
      D.RACK_CHECK_QUESTIONS.forEach(q => { answers[q.id] = fd.has(q.id); });
      const result = E.assessRackHealth(answers);
      const info = D.RACK_TABLE[result.level];
      document.getElementById("rack-result").innerHTML = `
        <div class="result-card">
          <div>ระดับ Rack Health: <strong style="color:${levelColor(result.level)}">${result.level}</strong> (${result.total}/${result.max})</div>
          <p>${info.desc}</p>
          <p><strong>แนวทาง:</strong> ${info.advice}</p>
          <button id="rack-save" class="btn-secondary">บันทึกลงประวัติ</button>
        </div>
      `;
      document.getElementById("rack-save").addEventListener("click", () => {
        addLogEntry({ type: "rack", level: result.level, score: `${result.total}/${result.max}` });
        document.getElementById("rack-save").textContent = "บันทึกแล้ว ✓";
        document.getElementById("rack-save").disabled = true;
      });
    });
  }
  function levelColor(level) {
    return { Excellent: "#2a9d8f", Good: "#588157", Stable: "#457b9d", Weak: "#e07a5f", Critical: "#e63946" }[level] || "#333";
  }

  /* ================= CHECKLIST S-R-B-T-G ================= */
  function renderChecklistTab() {
    const panel = document.getElementById("panel-checklist");
    panel.innerHTML = `
      <h2>Decision Checklist: S-R-B-T-G</h2>
      <p class="lead">ทบทวนก่อนเดินทุกตา — คะแนนไม่ใช่คำตอบสุดท้าย ต้องดู "คะแนน + มือ + กระดาน + คู่แข่ง + ช่วงเกม" ทุกครั้ง</p>
      <form id="checklist-form">
        ${D.SRBTG.map(item => `
          <div class="checklist-item">
            <div class="checklist-code">${item.code}</div>
            <div class="checklist-body">
              <div class="checklist-name">${item.name}</div>
              <div class="checklist-question">${item.question}</div>
              <textarea name="${item.code}" rows="2" placeholder="บันทึกสั้น ๆ..."></textarea>
            </div>
          </div>
        `).join("")}
        <button type="submit" class="btn-primary">บันทึก Checklist ตานี้</button>
      </form>
      <div id="checklist-result"></div>
    `;
    document.getElementById("checklist-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const answers = {};
      D.SRBTG.forEach(item => { answers[item.code] = fd.get(item.code) || ""; });
      addLogEntry({ type: "checklist", answers });
      document.getElementById("checklist-result").innerHTML = `<p class="muted">บันทึก Checklist แล้ว ✓ ดูย้อนหลังได้ที่แท็บ ประวัติ/สถิติ</p>`;
      ev.target.reset();
    });
  }

  /* ================= PRACTICE ================= */
  let practiceLevel = 3;
  let currentScenario = null;
  let currentMoveSet = null;

  function renderPracticeTab() {
    const panel = document.getElementById("panel-practice");
    panel.innerHTML = `
      <h2>ฝึกซ้อม — โครงสร้างการฝึก 4 ระดับ</h2>
      <div class="level-tabs">
        ${D.TRAINING_LEVELS.map(l => `<button class="level-btn ${l.level === practiceLevel ? "active" : ""}" data-level="${l.level}">${l.level}. ${l.name}</button>`).join("")}
      </div>
      <div id="practice-body"></div>
    `;
    panel.querySelectorAll(".level-btn").forEach(btn => {
      btn.addEventListener("click", () => { practiceLevel = +btn.dataset.level; renderPracticeTab(); });
    });
    const body = document.getElementById("practice-body");
    if (practiceLevel === 1) renderLevel1(body);
    else if (practiceLevel === 2) renderLevel2(body);
    else if (practiceLevel === 3) renderLevel3(body);
    else renderLevel4(body);
  }

  function randomMoveSet() {
    const names = ["A", "B", "C"];
    return names.map(n => ({
      label: "Move " + n,
      score: randInt(5, 45),
      position: randInt(-5, 10),
      rack: randInt(-5, 8),
      denial: randInt(0, 12),
      oppOpp: randInt(0, 15),
    }));
  }
  function renderLevel1(body) {
    const info = D.TRAINING_LEVELS[0];
    if (!currentMoveSet) currentMoveSet = randomMoveSet();
    body.innerHTML = `
      <p class="lead"><strong>เป้าหมาย:</strong> ${info.goal} — ${info.activity}</p>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>ทางเลือก</th><th>Score</th><th>Position</th><th>Rack</th><th>Denial</th><th>Opp. Opportunity</th></tr></thead>
        <tbody>${currentMoveSet.map(m => `<tr><td>${m.label}</td><td>${m.score}</td><td>${m.position}</td><td>${m.rack}</td><td>${m.denial}</td><td>${m.oppOpp}</td></tr>`).join("")}</tbody>
      </table></div>
      <p>เรียงลำดับทางเลือกจากดีที่สุดไปแย่ที่สุด โดยพิจารณา Move Value (ไม่ใช่แค่ Score)</p>
      <div class="row-actions">
        ${currentMoveSet.map(m => `<button class="choice-btn" data-label="${m.label}">${m.label} ดีที่สุด</button>`).join("")}
        <button id="l1-new" class="btn-secondary">โจทย์ใหม่</button>
      </div>
      <div id="l1-result"></div>
    `;
    body.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const computed = currentMoveSet.map(m => ({ ...m, value: E.moveValue({ score: m.score, position: m.position, rack: m.rack, denial: m.denial, opponentOpportunity: m.oppOpp }) }));
        const best = computed.reduce((a, b) => (b.value > a.value ? b : a));
        const correct = btn.dataset.label === best.label;
        document.getElementById("l1-result").innerHTML = `
          <div class="result-card">
            <p>${correct ? "✓ ถูกต้อง" : "✗ ยังไม่ใช่"} — Move Value จริงคือ:
            ${computed.map(m => `${m.label}=${m.value}`).join(", ")}</p>
            <p><strong>${best.label}</strong> คือทางเลือกที่ Move Value สูงสุด</p>
          </div>`;
        addLogEntry({ type: "practice", level: 1, result: correct ? "correct" : "incorrect", detail: computed });
      });
    });
    document.getElementById("l1-new").addEventListener("click", () => { currentMoveSet = randomMoveSet(); renderLevel1(body); });
  }

  function renderLevel2(body) {
    const info = D.TRAINING_LEVELS[1];
    const zone = pick(D.ZONE_TABLE);
    const threat = pick(D.THREAT_TYPES);
    body.innerHTML = `
      <p class="lead"><strong>เป้าหมาย:</strong> ${info.goal} — ${info.activity}</p>
      <div class="scenario-box">
        <p>สมมติว่าการเดินของคุณตานี้ทำให้เกิด <strong>${zone.zone}</strong> ขึ้นบนกระดาน และอาจเกี่ยวข้องกับ <strong>${threat.name}</strong>
        ของคู่แข่ง ลองอธิบายว่าการเดินนี้เปิดหรือปิดพื้นที่ใด และควรระวังอะไรต่อ</p>
      </div>
      <textarea id="l2-reflect" rows="4" placeholder="เขียนคำอธิบายของคุณ..."></textarea>
      <div class="row-actions">
        <button id="l2-check" class="btn-secondary">ดูแนวคำตอบ</button>
        <button id="l2-save" class="btn-primary">บันทึก</button>
      </div>
      <div id="l2-answer"></div>
    `;
    document.getElementById("l2-check").addEventListener("click", () => {
      document.getElementById("l2-answer").innerHTML = `
        <div class="result-card">
          <p><strong>${zone.zone}:</strong> ${zone.meaning} — ${zone.note}</p>
          <p><strong>${threat.name}:</strong> ${threat.desc}</p>
        </div>`;
    });
    document.getElementById("l2-save").addEventListener("click", () => {
      const text = document.getElementById("l2-reflect").value.trim();
      addLogEntry({ type: "practice", level: 2, zone: zone.zone, threat: threat.name, reflection: text });
      const btn = document.getElementById("l2-save");
      btn.textContent = "บันทึกแล้ว ✓"; btn.disabled = true;
    });
  }

  function renderLevel3(body) {
    const info = D.TRAINING_LEVELS[2];
    if (!currentScenario) currentScenario = pick(D.PRACTICE_SCENARIOS);
    const s = currentScenario;
    body.innerHTML = `
      <p class="lead"><strong>เป้าหมาย:</strong> ${info.goal} — ${info.activity}</p>
      <div class="scenario-box">
        <p>${s.story}</p>
        <p class="scenario-tags">GAP: <strong>${s.gap}</strong> · Phase: <strong>${s.phase}</strong> · Rack: <strong>${s.rack}</strong> · Board: <strong>${s.board}</strong> · Threat: <strong>${s.threat}</strong></p>
      </div>
      <p>คุณจะเลือก Tactical Mode ใด?</p>
      <div class="row-actions">
        ${Object.keys(D.MODES).map(k => `<button class="choice-btn" data-mode="${k}" style="border-color:${D.MODES[k].color}">${k}</button>`).join("")}
      </div>
      <div id="l3-result"></div>
      <button id="l3-new" class="btn-secondary" style="margin-top:12px">โจทย์ถัดไป</button>
    `;
    body.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const rec = E.recommendMode(s);
        const chosen = btn.dataset.mode;
        let result;
        if (chosen === rec.primary) result = "correct";
        else if (chosen === rec.secondary) result = "partial";
        else result = "incorrect";
        const label = { correct: "✓ ถูกต้อง (ตรงโหมดหลัก)", partial: "◐ ถูกบางส่วน (ตรงโหมดรอง)", incorrect: "✗ ยังไม่ใช่" }[result];
        document.getElementById("l3-result").innerHTML = `
          <div class="result-card">
            <p>${label}</p>
            <p>โหมดหลัก ${modeBadge(rec.primary)} โหมดรอง ${modeBadge(rec.secondary)}</p>
            <ul class="reasons">${rec.reasons.map(r => `<li>${r}</li>`).join("")}</ul>
          </div>`;
        addLogEntry({ type: "practice", level: 3, scenario: s, chosen, mode: rec.primary, result });
      });
    });
    document.getElementById("l3-new").addEventListener("click", () => { currentScenario = pick(D.PRACTICE_SCENARIOS); renderLevel3(body); });
  }

  function renderLevel4(body) {
    const info = D.TRAINING_LEVELS[3];
    if (!currentScenario) currentScenario = pick(D.PRACTICE_SCENARIOS);
    const s = currentScenario;
    body.innerHTML = `
      <p class="lead"><strong>เป้าหมาย:</strong> ${info.goal} — ${info.activity}</p>
      <div class="scenario-box">
        <p>${s.story}</p>
        <p class="scenario-tags">GAP: <strong>${s.gap}</strong> · Phase: <strong>${s.phase}</strong> · Rack: <strong>${s.rack}</strong> · Board: <strong>${s.board}</strong> · Threat: <strong>${s.threat}</strong></p>
      </div>
      <p>คิดล่วงหน้าอย่างน้อย 2 จังหวะ: Our Move → Opponent Response → Our Next Move
      (อยากคำนวณ Expected Value เป็นตัวเลขจริง ไปต่อที่แท็บ <strong>Simulator</strong> ได้)</p>
      <form id="l4-form" class="two-turn-form">
        <label>การเดินของเรา (Our Move)<textarea name="ourMove" rows="2"></textarea></label>
        <label>คาดการตอบของคู่แข่ง (Opponent Response)<textarea name="oppResponse" rows="2"></textarea></label>
        <label>การเดินถัดไปของเรา (Our Next Move)<textarea name="ourNextMove" rows="2"></textarea></label>
        <div class="row-actions">
          <button type="submit" class="btn-primary">บันทึก Worksheet</button>
          <button type="button" id="l4-new" class="btn-secondary">โจทย์ใหม่</button>
        </div>
      </form>
      <div id="l4-result"></div>
    `;
    document.getElementById("l4-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      addLogEntry({
        type: "practice", level: 4, scenario: s,
        ourMove: fd.get("ourMove"), oppResponse: fd.get("oppResponse"), ourNextMove: fd.get("ourNextMove"),
      });
      document.getElementById("l4-result").innerHTML = `<p class="muted">บันทึก Worksheet แล้ว ✓</p>`;
    });
    document.getElementById("l4-new").addEventListener("click", () => { currentScenario = pick(D.PRACTICE_SCENARIOS); renderLevel4(body); });
  }

  /* ================= MATCH LOG (Phase 2) ================= */
  const CURRENT_MATCH_KEY = "amats_current_match_v1";
  let currentMatch = null;
  function persistCurrentMatch() {
    try { localStorage.setItem(CURRENT_MATCH_KEY, JSON.stringify(currentMatch)); } catch (e) { /* storage unavailable */ }
  }
  function clearPersistedMatch() {
    try { localStorage.removeItem(CURRENT_MATCH_KEY); } catch (e) { /* storage unavailable */ }
  }
  function loadPersistedMatch() {
    try { return JSON.parse(localStorage.getItem(CURRENT_MATCH_KEY)) || null; } catch (e) { return null; }
  }

  function currentTurnContext() {
    const settings = AMATS_PHASE2.loadSettings();
    const turnNo = currentMatch.turns.length + 1;
    const ourTotal = currentMatch.turns.reduce((s, t) => s + t.ourDelta, 0);
    const oppTotal = currentMatch.turns.reduce((s, t) => s + t.oppDelta, 0);
    const diff = ourTotal - oppTotal;
    return {
      turnNo, ourTotal, oppTotal, diff,
      gap: AMATS_PHASE2.classifyGap(diff, settings),
      phase: AMATS_PHASE2.classifyPhase(turnNo, currentMatch.totalTurns || settings.totalTurns),
    };
  }

  function updateTurnSuggestion(ctx) {
    const rack = document.getElementById("turn-rack").value;
    const board = document.getElementById("turn-board").value;
    const threat = document.getElementById("turn-threat").value;
    const rec = E.recommendMode({ gap: ctx.gap, phase: ctx.phase, rack, board, threat });
    document.getElementById("turn-suggestion").innerHTML = `
      <div class="suggestion-box">
        <div>ตาที่ ${ctx.turnNo} · GAP: <strong>${ctx.gap}</strong> (${ctx.diff >= 0 ? "+" : ""}${ctx.diff}) · Phase: <strong>${ctx.phase}</strong></div>
        <div>คำแนะนำ AMATS: ${modeBadge(rec.primary)} / ${modeBadge(rec.secondary)}</div>
      </div>`;
  }

  function renderMatchTab() {
    const panel = document.getElementById("panel-match");

    if (!currentMatch) {
      const defaultTurns = AMATS_PHASE2.loadSettings().totalTurns;
      panel.innerHTML = `
        <h2>บันทึกเกม</h2>
        <p class="lead">บันทึกเกมจริงทีละตา เพื่อสะสมข้อมูลไว้วิเคราะห์ (Phase 2: Data Analytics) — GAP และ Game Phase จะคำนวณอัตโนมัติจากคะแนนจริง</p>
        <form id="match-start-form" class="form-grid">
          <label>ชื่อคู่แข่ง (ถ้ามี)<input type="text" name="opponent" placeholder="ไม่ระบุก็ได้"></label>
          <label>จำนวนตาทั้งเกม (โดยประมาณ)<input type="number" name="totalTurns" value="${defaultTurns}" min="4" max="60"></label>
          <button type="submit" class="btn-primary">เริ่มเกม</button>
        </form>
      `;
      document.getElementById("match-start-form").addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        currentMatch = {
          id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          opponent: fd.get("opponent") || "",
          totalTurns: parseInt(fd.get("totalTurns"), 10) || defaultTurns,
          startedAt: Date.now(),
          turns: [],
        };
        persistCurrentMatch();
        renderMatchTab();
      });
      return;
    }

    const ctx = currentTurnContext();
    panel.innerHTML = `
      <h2>บันทึกเกม${currentMatch.opponent ? " — vs " + currentMatch.opponent : ""}</h2>
      <p class="lead">คะแนนรวม: เรา ${ctx.ourTotal} — คู่แข่ง ${ctx.oppTotal} (${ctx.diff >= 0 ? "นำอยู่" : "ตามอยู่"} ${Math.abs(ctx.diff)})</p>

      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>ตา</th><th>GAP</th><th>Phase</th><th>Mode</th><th>ตรงคำแนะนำ</th><th>เรา</th><th>คู่แข่ง</th><th>Net</th></tr></thead>
        <tbody>${currentMatch.turns.map(t => `
          <tr><td>${t.turnNo}</td><td>${t.gap}</td><td>${t.phase}</td><td>${modeBadge(t.mode, "sm")}</td>
          <td>${t.mode === t.recommendedPrimary ? "✓" : "—"}</td>
          <td>${t.ourDelta}</td><td>${t.oppDelta}</td><td>${t.ourDelta - t.oppDelta}</td></tr>
        `).join("") || `<tr><td colspan="8" class="muted">ยังไม่มีตาที่บันทึก</td></tr>`}</tbody>
      </table></div>

      <h3>บันทึกตาที่ ${ctx.turnNo}</h3>
      <div id="turn-suggestion"></div>
      <form id="turn-form" class="form-grid">
        <label>Rack Health<select id="turn-rack" name="rack">${optionList(D.RACK_LEVELS, "Good")}</select></label>
        <label>Board State<select id="turn-board" name="board">${optionList(D.BOARD_STATES, "Balanced")}</select></label>
        <label>Threat<select id="turn-threat" name="threat">${optionList(D.THREAT_LEVELS, "Low")}</select></label>
        <label>Tactical Mode ที่ใช้จริง<select name="mode">${Object.keys(D.MODES).map(k => `<option value="${k}">${k}</option>`).join("")}</select></label>
        <label>คะแนนเราได้ตานี้<input type="number" name="ourDelta" value="0" required></label>
        <label>คะแนนคู่แข่งตอบ<input type="number" name="oppDelta" value="0" required></label>
        <label class="check-row"><input type="checkbox" name="bonusUsed"> ใช้โบนัสตานี้</label>
        <label>บันทึกเพิ่มเติม<input type="text" name="note" placeholder="ไม่บังคับ"></label>
        <button type="submit" class="btn-primary">บันทึกตานี้</button>
      </form>

      <div class="row-actions">
        <button id="match-end" class="btn-secondary">จบเกม</button>
        <button id="match-discard" class="btn-danger">ยกเลิกเกมนี้</button>
      </div>
      <div id="match-end-box"></div>
    `;

    ["turn-rack", "turn-board", "turn-threat"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => updateTurnSuggestion(ctx));
    });
    updateTurnSuggestion(ctx);

    document.getElementById("turn-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const rack = fd.get("rack"), board = fd.get("board"), threat = fd.get("threat"), mode = fd.get("mode");
      const rec = E.recommendMode({ gap: ctx.gap, phase: ctx.phase, rack, board, threat });
      currentMatch.turns.push({
        turnNo: ctx.turnNo, gap: ctx.gap, phase: ctx.phase, rack, board, threat, mode,
        recommendedPrimary: rec.primary, recommendedSecondary: rec.secondary,
        ourDelta: parseFloat(fd.get("ourDelta")) || 0,
        oppDelta: parseFloat(fd.get("oppDelta")) || 0,
        bonusUsed: fd.has("bonusUsed"),
        note: fd.get("note") || "",
      });
      persistCurrentMatch();
      renderMatchTab();
    });

    document.getElementById("match-end").addEventListener("click", () => {
      document.getElementById("match-end-box").innerHTML = `
        <form id="match-end-form" class="form-grid">
          <label>ผลการแข่งขัน<select name="result">
            <option value="win">ชนะ</option><option value="loss">แพ้</option><option value="draw">เสมอ</option>
          </select></label>
          <button type="submit" class="btn-primary">บันทึกผลและจบเกม</button>
        </form>`;
      document.getElementById("match-end-form").addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        currentMatch.result = fd.get("result");
        currentMatch.finishedAt = Date.now();
        const matches = AMATS_PHASE2.loadMatches();
        matches.unshift(currentMatch);
        AMATS_PHASE2.saveMatches(matches);
        currentMatch = null;
        clearPersistedMatch();
        renderMatchTab();
        renderAnalyticsTab();
        renderDashboardTab();
      });
    });

    document.getElementById("match-discard").addEventListener("click", () => {
      if (confirm("ยกเลิกเกมนี้โดยไม่บันทึกหรือไม่? การกระทำนี้ย้อนกลับไม่ได้")) {
        currentMatch = null;
        clearPersistedMatch();
        renderMatchTab();
      }
    });
  }

  /* ================= ANALYTICS (Phase 2) ================= */
  function renderAnalyticsTab() {
    const panel = document.getElementById("panel-analytics");
    const settings = AMATS_PHASE2.loadSettings();
    const matches = AMATS_PHASE2.loadMatches();
    const agg = AMATS_PHASE2.computeAggregate(matches);

    panel.innerHTML = `
      <h2>วิเคราะห์ข้อมูล (Phase 2: Data Analytics)</h2>
      <p class="lead">สรุปจากเกมที่บันทึกไว้ ${matches.length} เกม (${agg.turnsCount || 0} ตา) — ยิ่งสะสมเกมมาก ค่าพวกนี้ยิ่งสะท้อนสไตล์การเล่นจริงมากขึ้น</p>

      <h3>ปรับเกณฑ์ตัวเลข (Calibration)</h3>
      <form id="settings-form" class="form-grid">
        <label>จำนวนตาทั้งเกม (ค่าเริ่มต้น)<input type="number" name="totalTurns" value="${settings.totalTurns}" min="4" max="60"></label>
        <label>ส่วนต่างคะแนนที่ถือว่า “นำ/ตามเล็กน้อย” (แต้ม)<input type="number" name="leadSmall" value="${settings.leadSmall}" min="1"></label>
        <label>ส่วนต่างคะแนนที่ถือว่า “นำ/ตามมาก” (แต้ม)<input type="number" name="leadBig" value="${settings.leadBig}" min="1"></label>
        <div class="row-actions">
          <button type="submit" class="btn-primary">บันทึกเกณฑ์</button>
          <button type="button" id="settings-reset" class="btn-secondary">รีเซ็ตเป็นค่าเริ่มต้น</button>
        </div>
      </form>
      <p class="muted footnote">หมายเหตุจากเอกสาร AMATS: เกณฑ์เหล่านี้ควรปรับจากข้อมูลการฝึกจริงของผู้เล่นและรูปแบบการแข่งขัน ไม่ควรกำหนดเป็นค่าตายตัวตั้งแต่เริ่มต้น</p>

      ${agg.turnsCount ? `
        <h3>KPI ภาพรวม</h3>
        <div class="kpi-row">
          <div class="kpi"><div class="kpi-num">${agg.winRate === null ? "—" : Math.round(agg.winRate * 100) + "%"}</div><div class="kpi-label">Win Rate</div></div>
          <div class="kpi"><div class="kpi-num">${agg.avgScore.toFixed(1)}</div><div class="kpi-label">Average Score / Turn</div></div>
          <div class="kpi"><div class="kpi-num">${agg.netGainPerTurn.toFixed(1)}</div><div class="kpi-label">Net Gain / Turn</div></div>
          <div class="kpi"><div class="kpi-num">${agg.avgOppScore.toFixed(1)}</div><div class="kpi-label">Opponent Score / Turn</div></div>
          <div class="kpi"><div class="kpi-num">${agg.rackAvg.toFixed(2)}/5</div><div class="kpi-label">Rack Health เฉลี่ย</div></div>
          <div class="kpi"><div class="kpi-num">${Math.round(agg.resetFreq * 100)}%</div><div class="kpi-label">Reset Frequency</div></div>
          <div class="kpi"><div class="kpi-num">${agg.threatsAllowed}</div><div class="kpi-label">Threats Allowed</div></div>
          <div class="kpi"><div class="kpi-num">${Math.round(agg.bonusConversion * 100)}%</div><div class="kpi-label">Bonus Conversion (โดยประมาณ)</div></div>
          <div class="kpi"><div class="kpi-num">${agg.endgameEfficiency === null ? "—" : agg.endgameEfficiency.toFixed(1)}</div><div class="kpi-label">Endgame Efficiency</div></div>
          <div class="kpi"><div class="kpi-num">${Math.round(agg.adherence * 100)}%</div><div class="kpi-label">AMATS Adherence</div></div>
        </div>

        <h3>ประสิทธิภาพรายโหมด</h3>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Mode</th><th>จำนวนตาที่ใช้</th><th>Net Gain เฉลี่ย</th></tr></thead>
          <tbody>${Object.entries(agg.modeStats).sort((a, b) => b[1].count - a[1].count).map(([k, s]) => `
            <tr><td>${modeBadge(k)}</td><td>${s.count}</td><td>${s.avgNetGain.toFixed(1)}</td></tr>
          `).join("")}</tbody>
        </table></div>

        <h3>ประวัติเกม</h3>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>วันที่</th><th>คู่แข่ง</th><th>ผล</th><th>ตา</th><th>คะแนนสุดท้าย</th><th></th></tr></thead>
          <tbody>${matches.map(m => {
            const kpi = AMATS_PHASE2.computeMatchKPIs(m);
            const finalOur = (m.turns || []).reduce((s, t) => s + t.ourDelta, 0);
            const finalOpp = (m.turns || []).reduce((s, t) => s + t.oppDelta, 0);
            const resultLabel = { win: "ชนะ", loss: "แพ้", draw: "เสมอ" }[m.result] || m.result;
            return `<tr><td>${fmtDate(m.startedAt)}</td><td>${m.opponent || "—"}</td><td>${resultLabel}</td>
              <td>${kpi.turnsCount}</td><td>${finalOur} - ${finalOpp}</td>
              <td><button class="row-del match-del" data-id="${m.id}">✕</button></td></tr>`;
          }).join("")}</tbody>
        </table></div>

        <button id="export-csv" class="btn-secondary">Export CSV ทั้งหมด</button>
      ` : `<p class="muted">ยังไม่มีเกมที่บันทึกจบ ลองไปที่แท็บ "บันทึกเกม" เพื่อเริ่มเก็บข้อมูล</p>`}
    `;

    document.getElementById("settings-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      AMATS_PHASE2.saveSettings({
        totalTurns: parseInt(fd.get("totalTurns"), 10) || AMATS_PHASE2.DEFAULT_SETTINGS.totalTurns,
        leadSmall: parseFloat(fd.get("leadSmall")) || AMATS_PHASE2.DEFAULT_SETTINGS.leadSmall,
        leadBig: parseFloat(fd.get("leadBig")) || AMATS_PHASE2.DEFAULT_SETTINGS.leadBig,
      });
      renderAnalyticsTab();
    });
    document.getElementById("settings-reset").addEventListener("click", () => {
      AMATS_PHASE2.resetSettings();
      renderAnalyticsTab();
    });
    const exportBtn = document.getElementById("export-csv");
    if (exportBtn) exportBtn.addEventListener("click", () => downloadCSV("amats_matches.csv", AMATS_PHASE2.toCSV(matches)));
    panel.querySelectorAll(".match-del").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!confirm("ลบเกมนี้หรือไม่? การกระทำนี้ย้อนกลับไม่ได้")) return;
        AMATS_PHASE2.saveMatches(AMATS_PHASE2.loadMatches().filter(m => m.id !== btn.dataset.id));
        renderAnalyticsTab();
        renderDashboardTab();
      });
    });
  }

  /* ================= HISTORY ================= */
  function renderHistoryTab() {
    const panel = document.getElementById("panel-history");
    const log = loadLog();
    panel.innerHTML = `
      <h2>ประวัติ/สถิติ</h2>
      ${log.length === 0 ? `<p class="muted">ยังไม่มีประวัติการฝึก</p>` : `
        <button id="clear-log" class="btn-danger">ล้างประวัติทั้งหมด</button>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>เวลา</th><th>ประเภท</th><th>รายละเอียด</th></tr></thead>
          <tbody>${log.map(entrySummaryRow).join("")}</tbody>
        </table></div>
      `}
    `;
    const clearBtn = document.getElementById("clear-log");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (confirm("ล้างประวัติการฝึกทั้งหมดหรือไม่? การกระทำนี้ย้อนกลับไม่ได้")) {
        saveLog([]);
        renderHistoryTab();
        renderDashboardTab();
      }
    });
  }
  function entrySummaryRow(e) {
    const typeLabel = { advisor: "Tactical Advisor", move: "Move Comparator", simulation: "Simulator (2-Turn EV)", rack: "Rack Health", checklist: "Checklist S-R-B-T-G", practice: "ฝึกซ้อม" }[e.type] || e.type;
    let detail = "";
    if (e.type === "advisor") detail = `${e.state.gap} / ${e.state.phase} → ${modeBadge(e.mode, "sm")}`;
    else if (e.type === "move") detail = e.rows.map(r => `${r.label}:${r.value}`).join(", ");
    else if (e.type === "simulation") {
      const best = e.moves.reduce((a, b) => (b.ev > a.ev ? b : a));
      detail = `ดีที่สุด: ${best.label} (EV ${best.ev.toFixed(1)}) — ${e.moves.map(m => `${m.label}:${m.ev.toFixed(1)}`).join(", ")}`;
    }
    else if (e.type === "rack") detail = `${e.level} (${e.score})`;
    else if (e.type === "checklist") detail = D.SRBTG.map(i => i.code).join("");
    else if (e.type === "practice") detail = `Level ${e.level}${e.result ? " — " + e.result : ""}`;
    return `<tr><td>${fmtDate(e.ts)}</td><td>${typeLabel}</td><td>${detail}</td></tr>`;
  }

  /* ================= PLAYBOOK ================= */
  function renderPlaybookTab() {
    const panel = document.getElementById("panel-playbook");
    panel.innerHTML = `
      <h2>AMATS Quick Playbook</h2>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Mode</th><th>หน้าที่หลัก</th><th>ใช้เมื่อ</th><th>ลักษณะการเล่น</th></tr></thead>
        <tbody>${Object.values(D.MODES).map(m => `<tr><td>${modeBadge(m.key)}</td><td>${m.tagline}</td><td>${m.useWhen}</td><td>${m.style}</td></tr>`).join("")}</tbody>
      </table></div>

      <h3>Risk ตามสถานการณ์</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>สถานการณ์</th><th>Risk ที่เหมาะสม</th><th>หลักคิด</th></tr></thead>
        <tbody>${Object.entries(D.RISK_TABLE).map(([gap, r]) => `<tr><td>${gap}</td><td>${r.risk}</td><td>${r.note}</td></tr>`).join("")}</tbody>
      </table></div>

      <h3>Board Zones</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Zone</th><th>ความหมาย</th><th>แนวคิด</th></tr></thead>
        <tbody>${D.ZONE_TABLE.map(z => `<tr><td>${z.zone}</td><td>${z.meaning}</td><td>${z.note}</td></tr>`).join("")}</tbody>
      </table></div>

      <h3>Threat Analysis</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>ประเภท</th><th>ความหมาย</th></tr></thead>
        <tbody>${D.THREAT_TYPES.map(t => `<tr><td>${t.name}</td><td>${t.desc}</td></tr>`).join("")}</tbody>
      </table></div>

      <h3>Player Profile</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Profile</th><th>จุดเด่น</th><th>สิ่งที่ต้องระวัง</th></tr></thead>
        <tbody>${D.PLAYER_PROFILES.map(p => `<tr><td>${p.name}</td><td>${p.strength}</td><td>${p.watch}</td></tr>`).join("")}</tbody>
      </table></div>

      <p class="muted footnote">หมายเหตุ: เกณฑ์เชิงตัวเลข เช่น คะแนน GAP ที่ถือว่า "มาก/น้อย" หรือค่าคะแนน Rack Health
      ควรปรับจากข้อมูลการฝึกจริงของผู้เล่นและรูปแบบการแข่งขัน ไม่ควรกำหนดเป็นค่าตายตัวตั้งแต่เริ่มต้น</p>
    `;
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    currentMatch = loadPersistedMatch();
    initTabs();
    renderDashboardTab();
    renderAdvisorTab();
    renderMoveComparatorTab();
    renderSimulatorTab();
    renderRackTab();
    renderChecklistTab();
    renderPracticeTab();
    renderMatchTab();
    renderAnalyticsTab();
    renderHistoryTab();
    renderPlaybookTab();
  });
})();
