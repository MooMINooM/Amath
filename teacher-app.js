(() => {
  let teacher = null;
  let liveRows = [];
  let students = [];
  let matches = [];
  let liveChannel = null;
  let selectedLiveId = null;
  let selectedTurns = [];
  let pitCharts = {};
  let selectedTelemetryRequest = 0;
  let replayMatch = null;
  let replayStudent = null;
  let replayTurns = [];
  let replayIndex = 0;
  let replayCriticalOnly = false;
  let replayReturnView = "student-detail";
  let replayRequestedTurnId = null;
  let deepCharts = {};

  const $ = id => document.getElementById(id);
  const sb = () => AMATH_TEACHER_AUTH.getClient();

  function fmtTime(ms) {
    if (ms == null) return "—";
    const neg = ms < 0;
    const total = Math.floor(Math.abs(ms) / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${neg ? "-" : ""}${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function pct(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return `${Math.round(Number(v))}%`;
  }

  function setPitwallDataStatus(message, tone = "ok") {
    const el = $("pitwall-data-status");
    if (!el) return;
    el.textContent = message;
    el.className = `pitwall-data-status ${tone}`;
  }

  function fallbackRowFromMatch(m) {
    const profile = students.find(s => s.user_id === m.student_user_id);
    return {
      student_user_id: m.student_user_id,
      match_id: m.id,
      student_code: m.student_code || profile?.student_code || "—",
      student_name: m.student_name || profile?.full_name || "นักเรียน",
      class_name: m.class_name || profile?.class_name || null,
      room_no: m.room_no || profile?.room_no || null,
      status: m.status === "active" ? "playing" : (m.status === "finished" ? "finished" : "disconnected"),
      ruleset_id: m.ruleset_id || null,
      difficulty: m.difficulty || null,
      turn_number: 0,
      active_side: null,
      player_score: m.final_player_score ?? 0,
      bot_score: m.final_bot_score ?? 0,
      bag_count: null,
      player_time_ms: null,
      bot_time_ms: null,
      decision_quality: m.summary?.avgDecisionQuality ?? null,
      tactical_loss: m.summary?.avgTacticalLoss ?? null,
      win_probability: null,
      pressure_level: null,
      rack_quality: null,
      board_snapshot: null,
      rack_snapshot: null,
      last_equation: null,
      last_move_score: null,
      updated_at: m.updated_at || m.finished_at || m.started_at,
      _source: "matches-fallback",
    };
  }

  function setView(name) {
    document.querySelectorAll(".view").forEach(v => v.hidden = true);
    $("view-" + name).hidden = false;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    if (name === "pitwall") refreshLive();
    if (name === "students") refreshStudents();
  }

  async function unlock(t) {
    teacher = t;
    document.body.classList.remove("teacher-locked");
    $("teacher-login").hidden = true;
    $("teacher-name").textContent = t.full_name;
    $("welcome-title").textContent = `ยินดีต้อนรับ ${t.full_name}`;
    setView("home");
    await Promise.all([refreshLive(), refreshStudents()]);
    subscribeLive();
  }

  async function initAuth() {
    const form = $("teacher-login-form");
    const err = $("teacher-login-error");
    const restored = await AMATH_TEACHER_AUTH.restore();
    if (restored.ok) await unlock(restored.teacher);

    form.addEventListener("submit", async e => {
      e.preventDefault();
      err.hidden = true;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      const result = await AMATH_TEACHER_AUTH.signIn($("teacher-email").value, $("teacher-password").value);
      btn.disabled = false;
      if (!result.ok) {
        err.textContent = result.message || "เข้าสู่ระบบไม่สำเร็จ";
        err.hidden = false;
        return;
      }
      $("teacher-password").value = "";
      await unlock(result.teacher);
    });

    $("teacher-logout").addEventListener("click", async () => {
      if (liveChannel) await sb().removeChannel(liveChannel);
      await AMATH_TEACHER_AUTH.signOut();
      teacher = null;
      document.body.classList.add("teacher-locked");
      $("teacher-login").hidden = false;
      $("teacher-password").value = "";
    });
  }

  async function refreshLive() {
    if (!teacher) return;
    setPitwallDataStatus("กำลังอ่าน live_sessions...", "loading");

    const liveResult = await sb()
      .from("live_sessions")
      .select("*")
      .order("updated_at", { ascending:false });

    if (!liveResult.error && (liveResult.data || []).length) {
      liveRows = liveResult.data || [];
      setPitwallDataStatus(`Realtime พร้อม · ${liveRows.length} session`, "ok");
    } else {
      const matchResult = await sb()
        .from("matches")
        .select("id,student_user_id,student_code,student_name,class_name,room_no,status,ruleset_id,ruleset_label,difficulty,started_at,finished_at,final_player_score,final_bot_score,summary,updated_at")
        .order("started_at",{ascending:false})
        .limit(100);

      if (liveResult.error) {
        console.warn("[Pitwall] live_sessions query failed", liveResult.error);
      }

      if (!matchResult.error && (matchResult.data || []).length) {
        const latestByStudent = new Map();
        for (const m of matchResult.data) {
          if (!latestByStudent.has(m.student_user_id)) latestByStudent.set(m.student_user_id, m);
        }
        liveRows = [...latestByStudent.values()].map(fallbackRowFromMatch);
        const reason = liveResult.error ? "live_sessions อ่านไม่ได้" : "live_sessions ยังว่าง";
        setPitwallDataStatus(`${reason} · ใช้ประวัติ matches ชั่วคราว`, "warn");
      } else {
        liveRows = [];
        if (matchResult.error) console.warn("[Pitwall] matches fallback failed", matchResult.error);
        const code = liveResult.error?.code || matchResult.error?.code || "";
        setPitwallDataStatus(
          code ? `อ่านข้อมูลไม่ได้ (${code}) · ตรวจ RLS/SQL` : "ยังไม่พบข้อมูลการเล่นในฐานข้อมูล",
          "error"
        );
      }
    }

    renderLiveList();
    if (!selectedLiveId && liveRows.length) {
      const first = liveRows.find(r => r.status === "playing") || liveRows[0];
      selectLiveStudent(first.student_user_id);
    } else if (selectedLiveId && !liveRows.some(r => r.student_user_id === selectedLiveId)) {
      selectedLiveId = null;
    }
    $("last-refresh").textContent = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  }

  function subscribeLive() {
    if (liveChannel) sb().removeChannel(liveChannel);
    liveChannel = sb()
      .channel("teacher-pitwall-live")
      .on("postgres_changes", { event:"*", schema:"public", table:"live_sessions" }, payload => {
        const row = payload.new;
        if (!row?.student_user_id) return;
        const idx = liveRows.findIndex(x => x.student_user_id === row.student_user_id);
        if (idx >= 0) liveRows[idx] = row; else liveRows.unshift(row);
        liveRows.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
        renderLiveList();
        if (selectedLiveId === row.student_user_id) {
          renderLiveDetail(row);
          refreshSelectedTelemetry(false);
        }
      })
      .subscribe();
  }

  function liveFiltered() {
    const q = $("live-search").value.trim().toLowerCase();
    const status = $("live-status-filter").value;
    const sort = $("live-sort")?.value || "score";
    const rows = liveRows.filter(r => {
      const text = `${r.student_code || ""} ${r.student_name || ""} ${r.class_name || ""} ${r.room_no || ""}`.toLowerCase();
      return (!q || text.includes(q)) && (status === "all" || r.status === status);
    });
    rows.sort((a,b) => {
      if (sort === "time") return (a.player_time_ms ?? Infinity) - (b.player_time_ms ?? Infinity);
      if (sort === "recent") return new Date(b.updated_at) - new Date(a.updated_at);
      return (b.player_score || 0) - (a.player_score || 0);
    });
    return rows;
  }

  function renderLiveList() {
    const rows = liveFiltered();
    $("live-count").textContent = liveRows.filter(r => r.status === "playing").length;
    $("live-list").innerHTML = rows.length ? rows.map((r,idx) => {
      const isSelected = selectedLiveId === r.student_user_id;
      const statusLabel = r.status === "playing" ? "กำลังเล่น" : r.status === "finished" ? "จบแล้ว" : r.status;
      return `<button class="live-card ${isSelected ? "selected" : ""}" data-id="${r.student_user_id}">
        <span class="roster-rank">${idx + 1}</span>
        <span class="roster-person"><strong>${r.student_code || "—"} · ${r.student_name || "นักเรียน"}</strong><small>${r.class_name || ""}${r.room_no ? "/" + r.room_no : ""}${r._source === "matches-fallback" ? " · HISTORY" : ""}</small></span>
        <span class="roster-score">${r.player_score ?? 0}</span>
        <span class="roster-time">${fmtTime(r.player_time_ms)}</span>
        <span class="roster-status"><span class="status ${r.status}">${statusLabel}</span></span>
      </button>`;
    }).join("") : '<p class="empty">ยังไม่มี Live Session</p>';

    document.querySelectorAll(".pit-roster .live-card").forEach(btn => btn.addEventListener("click", () => {
      selectLiveStudent(btn.dataset.id);
    }));
  }

  function destroyPitCharts() {
    Object.values(pitCharts).forEach(ch => { try { ch.destroy(); } catch (e) {} });
    pitCharts = {};
  }

  function bonusClass(r,c) {
    if (typeof AMATH_DATA === "undefined") return "";
    const bonus = AMATH_DATA.bonusAt?.(r,c);
    return bonus ? ` bonus-${bonus.toLowerCase()}` : "";
  }

  function renderPitBoard(snapshot) {
    const el = $("pit-board");
    if (!Array.isArray(snapshot)) {
      el.className = "pit-board board-empty";
      el.textContent = "ยังไม่มีข้อมูลกระดาน";
      return;
    }
    el.className = "pit-board";
    let html = "";
    for (let r=0;r<15;r++) {
      for (let col=0;col<15;col++) {
        const cell = snapshot?.[r]?.[col] || null;
        const center = r === 7 && col === 7;
        const cls = `pit-board-cell${bonusClass(r,col)}${center ? " center" : ""}${cell ? " has-tile" : ""}`;
        html += `<div class="${cls}" title="${r+1},${col+1}">${cell ? `<span>${cell.c ?? cell.resolvedChar ?? cell.face ?? ""}</span><small class="tile-points">${cell.p ?? cell.points ?? ""}</small>` : ""}</div>`;
      }
    }
    el.innerHTML = html;
  }

  function renderPitRack(rack) {
    const el = $("pit-rack");
    if (!Array.isArray(rack) || !rack.length) {
      el.innerHTML = '<span class="empty">—</span>';
      return;
    }
    el.innerHTML = rack.map(t => `<span class="pit-rack-tile">${t.resolvedChar || t.face || (t.kind === "blank" ? "?" : "")}</span>`).join("");
  }

  function ringKpi(label,value) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? Math.max(0,Math.min(100,numeric)) : 0;
    const text = Number.isFinite(numeric) ? Math.round(numeric) + "%" : "—";
    return `<div class="pit-kpi"><small>${label}</small><div class="mini-ring" style="--v:${safe}" data-label="${text}"></div></div>`;
  }

  function secondaryKpi(icon,label,value) {
    const ok = value !== null && value !== undefined && Number.isFinite(Number(value));
    return `<div class="secondary-kpi ${ok ? "" : "unavailable"}"><span>${icon}</span><small>${label}</small><strong>${ok ? Math.round(Number(value))+"%" : "—"}</strong></div>`;
  }

  function average(nums) {
    const vals = nums.filter(v => Number.isFinite(Number(v))).map(Number);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  }

  function selectedRow() {
    return liveRows.find(r => r.student_user_id === selectedLiveId) || null;
  }

  function selectLiveStudent(studentId) {
    selectedLiveId = studentId;
    renderLiveList();
    const row = selectedRow();
    if (!row) return;
    renderLiveDetail(row);
    refreshSelectedTelemetry(true);
  }

  function renderLiveDetail(r) {
    const gap = (r.player_score || 0) - (r.bot_score || 0);
    const totalClock = r.ruleset_id === "PRIMARY_70" ? 20*60*1000 : 22*60*1000;
    const timePct = r.player_time_ms == null ? 0 : Math.max(0,Math.min(100,r.player_time_ms / totalClock * 100));
    const cls = [r.class_name,r.room_no].filter(Boolean).join("/");
    const active = r.active_side === "player" ? "ตาของนักเรียน" : r.active_side === "bot" ? "ตาของบอท" : "—";

    $("selected-player-card").className = "pit-card selected-player-card";
    $("selected-player-card").innerHTML = `
      <div class="selected-player-summary">
        <div class="selected-person">
          <div class="selected-avatar">🧑‍🎓</div>
          <div><h3>${r.student_code || ""} · ${r.student_name || "นักเรียน"}</h3><p>${cls || "—"} · ${r.ruleset_id === "PRIMARY_70" ? "ประถม 70 เบี้ย" : "มาตรฐาน 100 เบี้ย"} · ${r.difficulty || "—"}</p></div>
        </div>
        <div class="selected-stat"><small>คะแนน</small><strong>${r.player_score ?? 0}</strong><span class="sub">Gap ${gap > 0 ? "+" : ""}${gap}</span></div>
        <div class="selected-stat time"><small>เวลาเหลือ</small><strong>${fmtTime(r.player_time_ms)}</strong><div class="time-bar"><i style="width:${timePct}%"></i></div></div>
        <div class="selected-stat"><small>เบี้ยในถุง</small><strong>${r.bag_count ?? "—"}</strong><span class="sub">Turn ${r.turn_number ?? 0}</span></div>
      </div>
      <div class="pit-selected-actions">
        <button id="pit-open-replay" class="pit-action-btn primary" type="button">▶ Replay แมตช์นี้</button>
        <button id="pit-open-student" class="pit-action-btn" type="button">ดู Deep Analysis</button>
      </div>`;

    $("pit-open-replay")?.addEventListener("click",()=>openPitwallReplay());
    $("pit-open-student")?.addEventListener("click",()=>openStudentDeepAnalysis(r.student_user_id));

    $("board-turn-badge").textContent = r._source === "matches-fallback" ? "ข้อมูลย้อนหลัง" : active;
    $("pitwall-round").textContent = r.ruleset_id === "PRIMARY_70" ? "ประถม 70 เบี้ย" : r.ruleset_id === "STANDARD_100" ? "มาตรฐาน 100 เบี้ย" : "โหมดฝึกซ้อม";
    renderPitBoard(r.board_snapshot);
    renderPitRack(r.rack_snapshot);

    $("performance-title").textContent = `ภาพรวมผู้เล่น (${r.student_code || ""})`;
    $("performance-live").className = `status ${r.status}`;
    $("performance-live").textContent = r.status === "playing" ? "สด" : r.status;

    const playerMoves = selectedTurns.filter(t => t.actor === "player" && (t.event_type || "move") === "move");
    const avgTime = average(playerMoves.map(t=>t.decision_time_ms));
    const avgDQ = average(playerMoves.map(t=>t.decision_quality));
    const rack = r.rack_quality;
    $("pit-kpis").innerHTML =
      ringKpi("Win %", r.win_probability) +
      ringKpi("DQ %", avgDQ ?? r.decision_quality) +
      `<div class="pit-kpi"><small>เวลาเฉลี่ย/ตา</small><strong>${avgTime == null ? "—" : Math.round(avgTime/1000)+"s"}</strong></div>` +
      `<div class="pit-kpi"><small>Rack</small><strong>${rack == null ? "—" : Number(rack).toFixed(0)+"%"}</strong></div>`;

    $("pit-secondary-kpis").innerHTML =
      secondaryKpi("🔥","Pressure",r.pressure_level) +
      secondaryKpi("🧠","Focus",null) +
      secondaryKpi("⚠","Risk",null) +
      secondaryKpi("🔋","Fatigue",null) +
      secondaryKpi("⚙","CL",null);

    renderAmatsLive(r, playerMoves);
    renderHeatmap(r.board_snapshot);
  }

  function renderAmatsLive(r,playerMoves) {
    const last = [...playerMoves].reverse()[0];
    const mode = last?.suggested_mode || null;
    const advice = {
      PRESS:"เร่งทำคะแนนเมื่อจังหวะเปิด",
      BUILD:"สร้างทางเลือกสำหรับตาถัดไป",
      CONTROL:"รักษาสมดุลคะแนนและเบี้ยในมือ",
      DENY:"ลดโอกาสทำคะแนนของคู่แข่ง",
      GUARD:"รักษาคะแนนนำและลดความเสี่ยง",
      RESET:"ปรับคุณภาพเบี้ยในมือ"
    };
    if (!mode && r.win_probability == null && r.tactical_loss == null) {
      $("pit-amats").className = "amats-live-empty";
      $("pit-amats").textContent = "ยังไม่มีข้อมูลสำหรับวิเคราะห์";
      return;
    }
    $("pit-amats").className = "amats-live";
    $("pit-amats").innerHTML = `
      <div class="amats-symbol">💡</div>
      <div><strong>${mode ? "โหมด "+mode : "กำลังติดตามสถานการณ์"}</strong><p>${advice[mode] || "ติดตามการตัดสินใจและจังหวะของเกมแบบสด"}</p></div>
      <div class="amats-live-chips">
        <span class="amats-chip">Gap ${(r.player_score||0)-(r.bot_score||0) >= 0 ? "+" : ""}${(r.player_score||0)-(r.bot_score||0)}</span>
        <span class="amats-chip">DQ ${pct(last?.decision_quality ?? r.decision_quality)}</span>
        <span class="amats-chip">Loss ${last?.tactical_loss == null ? "—" : Number(last.tactical_loss).toFixed(1)}</span>
      </div>`;
  }

  function renderHeatmap(snapshot) {
    const el = $("pit-heatmap");
    if (!Array.isArray(snapshot)) { el.innerHTML = ""; return; }
    let html = "";
    for (let r=0;r<15;r++) {
      for (let c=0;c<15;c++) {
        let density = 0;
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
          if (snapshot?.[r+dr]?.[c+dc]) density++;
        }
        const lvl = density === 0 ? 0 : density <=2 ? 1 : density <=4 ? 2 : density <=6 ? 3 : 4;
        html += `<span class="heat-cell ${lvl ? "occupied-"+lvl : ""}" title="density ${density}"></span>`;
      }
    }
    el.innerHTML = html;
  }

  async function refreshSelectedTelemetry(force=true) {
    const row = selectedRow();
    if (!row?.match_id) {
      selectedTurns = [];
      renderTelemetryPanels();
      return;
    }
    const requestId = ++selectedTelemetryRequest;
    const { data,error } = await sb()
      .from("turn_events")
      .select("id,match_id,actor,turn_number,event_type,occurred_at,move_score,equation,decision_time_ms,decision_quality,tactical_loss,move_value,best_move_value,gap_before,gap_after,rack_before,rack_after,board_state,threat_before,suggested_mode")
      .eq("match_id",row.match_id)
      .order("id",{ascending:true})
      .limit(500);
    if (requestId !== selectedTelemetryRequest) return;
    if (error) { console.warn(error); return; }
    selectedTurns = data || [];
    renderLiveDetail(row);
    renderTelemetryPanels();
  }

  function renderRecentMoves() {
    const moves = selectedTurns.slice(-8).reverse();
    $("pit-recent-moves").innerHTML = moves.length ? moves.map(t => `<button class="move-row pit-replay-turn ${isCriticalTurn(t) ? "critical" : ""}" data-turn-id="${t.id}" type="button" title="เปิด Turn นี้ใน Replay">
      <span class="turn">T${t.turn_number ?? "—"}</span>
      <small>${t.actor === "player" ? "นักเรียน" : "บอท"}</small>
      <span class="eq">${t.equation || t.event_type || "move"}</span>
      <span class="score">${t.move_score > 0 ? "+" : ""}${t.move_score ?? 0}</span>
    </button>`).join("") : '<p class="empty">ยังไม่มีการเดิน</p>';

    document.querySelectorAll(".pit-replay-turn").forEach(btn => {
      btn.addEventListener("click",()=>openPitwallReplay(Number(btn.dataset.turnId)));
    });
  }

  function chartBase(type,labels,datasets,opts={}) {
    return {
      type,
      data:{labels,datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        animation:false,
        plugins:{legend:{display:!!opts.legend,position:"top",labels:{boxWidth:8,font:{size:9}}}},
        scales: opts.noScales ? undefined : {
          x:{grid:{display:false},ticks:{font:{size:8},maxTicksLimit:6}},
          y:{beginAtZero:opts.beginAtZero !== false,grid:{color:"#edf3f8"},ticks:{font:{size:8},maxTicksLimit:5}}
        },
        ...opts.extra
      }
    };
  }

  function renderTelemetryCharts() {
    if (typeof Chart === "undefined") return;
    destroyPitCharts();
    const row = selectedRow();
    if (!row) return;
    const turns = selectedTurns;
    const player = turns.filter(t => t.actor === "player" && (t.event_type || "move") === "move");

    let ps=0,bs=0;
    const scoreLabels=[],pScores=[],bScores=[];
    turns.forEach((t,i)=>{
      if (t.actor === "player") ps += Number(t.move_score)||0; else bs += Number(t.move_score)||0;
      scoreLabels.push(t.turn_number ?? i+1); pScores.push(ps); bScores.push(bs);
    });
    pitCharts.score = new Chart($("pit-score-chart"),chartBase("line",scoreLabels,[
      {label:"นักเรียน",data:pScores,borderColor:"#1d7fe5",backgroundColor:"#1d7fe520",tension:.28,pointRadius:1.5,borderWidth:2},
      {label:"บอท",data:bScores,borderColor:"#9daec1",backgroundColor:"#9daec120",tension:.28,pointRadius:1.5,borderWidth:2}
    ],{legend:true}));

    pitCharts.dq = new Chart($("pit-dq-chart"),chartBase("bar",player.map(t=>t.turn_number),[
      {data:player.map(t=>t.decision_quality),backgroundColor:player.map(t => Number(t.decision_quality)>=70 ? "#2588ea" : Number(t.decision_quality)>=50 ? "#f0a533" : "#ea5263"),borderRadius:4}
    ]));

    pitCharts.time = new Chart($("pit-time-chart"),chartBase("line",player.map(t=>t.turn_number),[
      {data:player.map(t=>t.decision_time_ms == null ? null : Number((t.decision_time_ms/1000).toFixed(1))),borderColor:"#267fe0",tension:.3,pointRadius:2,borderWidth:2}
    ]));

    pitCharts.loss = new Chart($("pit-loss-chart"),chartBase("line",player.map(t=>t.turn_number),[
      {data:player.map(t=>t.tactical_loss),borderColor:"#9b6ee8",backgroundColor:"#9b6ee820",tension:.3,pointRadius:2,borderWidth:2,fill:true}
    ]));

    const avgDQ = average(player.map(t=>t.decision_quality)) ?? 0;
    const avgScore = average(player.map(t=>t.move_score)) ?? 0;
    const avgTime = average(player.map(t=>t.decision_time_ms));
    const avgLoss = average(player.map(t=>t.tactical_loss)) ?? 0;
    const occupied = Array.isArray(row.board_snapshot) ? row.board_snapshot.flat().filter(Boolean).length : 0;
    const profile = [
      Math.max(0,Math.min(100,avgDQ)),
      Math.max(0,Math.min(100,avgScore/20*100)),
      avgTime == null ? 0 : Math.max(0,Math.min(100,100-(avgTime/60000*100))),
      Math.max(0,Math.min(100,Number(row.rack_quality)||0)),
      Math.max(0,Math.min(100,100-avgLoss*5)),
      Math.max(0,Math.min(100,occupied/55*100))
    ];
    pitCharts.profile = new Chart($("pit-profile-chart"),{
      type:"radar",
      data:{labels:["DQ","Scoring","Speed","Rack","Control","Board"],datasets:[{data:profile,borderColor:"#2a7fd8",backgroundColor:"#2a7fd820",pointRadius:2,borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{r:{beginAtZero:true,max:100,ticks:{display:false},pointLabels:{font:{size:8}}}}}
    });

    const peers = liveRows.filter(x => x.student_user_id !== row.student_user_id && (!row.class_name || x.class_name === row.class_name));
    const peerScore = average(peers.map(x=>x.player_score)) ?? 0;
    const peerDQ = average(peers.map(x=>x.decision_quality)) ?? 0;
    const peerRack = average(peers.map(x=>x.rack_quality)) ?? 0;
    pitCharts.benchmark = new Chart($("pit-benchmark-chart"),chartBase("bar",["คะแนน","DQ","Rack"],[
      {label:row.student_code || "ผู้เล่น",data:[row.player_score||0,row.decision_quality||avgDQ,row.rack_quality||0],backgroundColor:"#2a84e6",borderRadius:4},
      {label:"ค่าเฉลี่ยกลุ่ม",data:[peerScore,peerDQ,peerRack],backgroundColor:"#aab8c8",borderRadius:4}
    ],{legend:true}));
  }

  function renderTelemetryPanels() {
    renderRecentMoves();
    renderTelemetryCharts();
  }

  async function refreshStudents() {
    if (!teacher) return;
    const [{ data:s, error:se }, { data:m, error:me }] = await Promise.all([
      sb().from("student_profiles").select("user_id,student_code,full_name,class_name,room_no,active").order("student_code"),
      sb().from("matches").select("id,student_user_id,result,final_player_score,final_bot_score,started_at,finished_at,status,difficulty,ruleset_id,ruleset_label,summary,end_reason").order("started_at",{ascending:false}),
    ]);
    if (se || me) return console.warn(se || me);
    students = s || [];
    matches = m || [];
    renderStudents();
  }

  function studentStats(id) {
    const ms = matches.filter(m => m.student_user_id === id && m.status === "finished");
    const wins = ms.filter(m => m.result === "win").length;
    const avg = ms.length ? ms.reduce((a,m)=>a+(m.final_player_score||0),0)/ms.length : 0;
    return { games:ms.length, wins, winRate:ms.length ? wins/ms.length*100 : 0, avg };
  }

  function destroyDeepCharts() {
    Object.values(deepCharts).forEach(ch => { try { ch.destroy(); } catch (e) {} });
    deepCharts = {};
  }

  function avg(arr) {
    const nums = arr.filter(v => Number.isFinite(Number(v))).map(Number);
    return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null;
  }

  function dateLabel(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("th-TH",{day:"2-digit",month:"short"});
  }

  function makeLineChart(id, labels, values, label) {
    const el = $(id);
    if (!el || typeof Chart === "undefined") return;
    deepCharts[id] = new Chart(el, {
      type:"line",
      data:{ labels, datasets:[{ label, data:values, tension:.28, pointRadius:3, borderWidth:2, fill:false }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, ticks:{ precision:0 } } }
      }
    });
  }

  function makeBarChart(id, labels, values, label) {
    const el = $(id);
    if (!el || typeof Chart === "undefined") return;
    deepCharts[id] = new Chart(el, {
      type:"bar",
      data:{ labels, datasets:[{ label, data:values, borderWidth:0, borderRadius:5 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true } }
      }
    });
  }

  function makeDoughnut(id, values) {
    const el = $(id);
    if (!el || typeof Chart === "undefined") return;
    deepCharts[id] = new Chart(el, {
      type:"doughnut",
      data:{ labels:["ชนะ","แพ้","เสมอ"], datasets:[{ data:values, borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" } }, cutout:"68%" }
    });
  }

  async function openStudentDeepAnalysis(studentId) {
    const student = students.find(s => s.user_id === studentId);
    if (!student) return;

    setView("student-detail");
    $("student-detail-name").textContent = student.full_name;
    $("student-detail-meta").textContent = `${student.student_code} · ${student.class_name || ""}/${student.room_no || ""}`;
    $("student-detail-status").innerHTML = student.active
      ? '<span class="status playing">ACTIVE</span>'
      : '<span class="status finished">INACTIVE</span>';

    $("student-kpis").innerHTML = '<div class="analysis-loading">กำลังโหลดข้อมูล...</div>';
    $("student-match-history").innerHTML = '<p class="empty">กำลังโหลด...</p>';
    $("student-turn-analysis").innerHTML = '<p class="empty">กำลังโหลด...</p>';

    const studentMatches = matches
      .filter(m => m.student_user_id === studentId)
      .sort((a,b)=>new Date(a.started_at)-new Date(b.started_at));

    const { data:turns, error } = await sb()
      .from("turn_events")
      .select("id,match_id,actor,turn_number,event_type,occurred_at,move_score,equation,decision_time_ms,decision_quality,tactical_loss,move_value,best_move_value,gap_before,gap_after,suggested_mode")
      .eq("student_user_id", studentId)
      .order("occurred_at",{ascending:true})
      .limit(2000);

    if (error) {
      console.warn(error);
      $("student-kpis").innerHTML = '<div class="analysis-loading">โหลด Turn Telemetry ไม่สำเร็จ</div>';
      return;
    }

    renderStudentDeepAnalysis(student, studentMatches, turns || []);
  }

  function renderStudentDeepAnalysis(student, studentMatches, turns) {
    destroyDeepCharts();

    const finished = studentMatches.filter(m => m.status === "finished");
    const playerTurns = turns.filter(t => t.actor === "player" && t.event_type === "move");
    const wins = finished.filter(m => m.result === "win").length;
    const losses = finished.filter(m => m.result === "loss" || m.result === "double_loss").length;
    const draws = finished.filter(m => m.result === "draw").length;
    const avgScore = avg(finished.map(m => m.final_player_score)) ?? 0;
    const avgDQ = avg(playerTurns.map(t => t.decision_quality));
    const avgLoss = avg(playerTurns.map(t => t.tactical_loss));
    const avgDecisionMs = avg(playerTurns.map(t => t.decision_time_ms));

    $("student-kpis").innerHTML = [
      ["เกมทั้งหมด", finished.length, ""],
      ["อัตราชนะ", finished.length ? Math.round(wins/finished.length*100) : 0, "%"],
      ["คะแนนเฉลี่ย", avgScore.toFixed(1), ""],
      ["Decision Quality", avgDQ == null ? "—" : Math.round(avgDQ), avgDQ == null ? "" : "%"],
      ["Tactical Loss", avgLoss == null ? "—" : avgLoss.toFixed(1), ""],
      ["เวลา/ตา", avgDecisionMs == null ? "—" : (avgDecisionMs/1000).toFixed(1), avgDecisionMs == null ? "" : "s"],
    ].map(([label,value,suffix]) => `<div class="deep-kpi"><small>${label}</small><strong>${value}${suffix}</strong></div>`).join("");

    const recentFinished = finished.slice(-12);
    makeLineChart(
      "score-trend-chart",
      recentFinished.map(m=>dateLabel(m.started_at)),
      recentFinished.map(m=>m.final_player_score ?? 0),
      "คะแนน"
    );

    const matchTurnMap = new Map();
    playerTurns.forEach(t => {
      if (!matchTurnMap.has(t.match_id)) matchTurnMap.set(t.match_id, []);
      matchTurnMap.get(t.match_id).push(t);
    });

    const matchDQ = recentFinished.map(m => avg((matchTurnMap.get(m.id)||[]).map(t=>t.decision_quality)));
    makeLineChart(
      "dq-trend-chart",
      recentFinished.map(m=>dateLabel(m.started_at)),
      matchDQ.map(v=>v == null ? null : Number(v.toFixed(1))),
      "Decision Quality"
    );

    const recentPlayerTurns = playerTurns.slice(-20);
    makeBarChart(
      "loss-chart",
      recentPlayerTurns.map(t=>`T${t.turn_number}`),
      recentPlayerTurns.map(t=>Number(t.tactical_loss)||0),
      "Tactical Loss"
    );

    makeLineChart(
      "decision-time-chart",
      recentPlayerTurns.map(t=>`T${t.turn_number}`),
      recentPlayerTurns.map(t=>t.decision_time_ms == null ? null : Number((t.decision_time_ms/1000).toFixed(1))),
      "วินาที"
    );

    makeDoughnut("result-chart",[wins,losses,draws]);

    $("student-match-history").innerHTML = finished.length ? [...finished].reverse().slice(0,12).map(m => {
      const resultText = m.result === "win" ? "ชนะ" : m.result === "draw" ? "เสมอ" : "แพ้";
      const cls = m.result === "win" ? "win" : m.result === "draw" ? "draw" : "loss";
      const mt = matchTurnMap.get(m.id) || [];
      const dq = avg(mt.map(t=>t.decision_quality));
      return `<button class="match-row replay-open-match" data-match-id="${m.id}" data-student-id="${student.user_id}" type="button">
        <span><strong>${dateLabel(m.started_at)}</strong><small>${m.ruleset_label || m.ruleset_id || "A-Math"} · ${m.difficulty || "—"}</small></span>
        <span class="match-result ${cls}">${resultText}</span>
        <span><strong>${m.final_player_score ?? 0}–${m.final_bot_score ?? 0}</strong><small>คะแนน</small></span>
        <span><strong>${dq == null ? "—" : Math.round(dq)+"%"}</strong><small>DQ · เปิด Replay →</small></span>
      </button>`;
    }).join("") : '<p class="empty">ยังไม่มีเกมที่จบแล้ว</p>';

    const worst = [...playerTurns]
      .filter(t => t.tactical_loss != null)
      .sort((a,b)=>(Number(b.tactical_loss)||0)-(Number(a.tactical_loss)||0))
      .slice(0,8);

    $("student-turn-analysis").innerHTML = worst.length ? worst.map(t => `<div class="turn-row">
      <span class="turn-no">T${t.turn_number}</span>
      <span><strong>${t.equation || t.event_type}</strong><small>${dateLabel(t.occurred_at)} · ${t.suggested_mode || "—"}</small></span>
      <span><strong>DQ ${t.decision_quality == null ? "—" : Math.round(t.decision_quality)+"%"}</strong><small>Loss ${t.tactical_loss == null ? "—" : Number(t.tactical_loss).toFixed(1)}</small></span>
    </div>`).join("") : '<p class="empty">ยังไม่มีข้อมูลตาที่วิเคราะห์ได้</p>';
    document.querySelectorAll(".replay-open-match").forEach(btn => {
      btn.addEventListener("click",()=>openMatchReplay(btn.dataset.matchId,btn.dataset.studentId));
    });

  }

  async function openPitwallReplay(turnId = null) {
    const row = selectedRow();
    if (!row?.match_id || !row?.student_user_id) return;
    await openMatchReplay(row.match_id, row.student_user_id, {
      returnView: "pitwall",
      turnId,
      liveRow: row,
    });
  }

  async function resolveReplayContext(matchId, studentId, liveRow = null) {
    let match = matches.find(m => m.id === matchId) || null;
    let student = students.find(s => s.user_id === studentId) || null;

    if (!match) {
      const { data, error } = await sb()
        .from("matches")
        .select("id,student_user_id,result,final_player_score,final_bot_score,started_at,finished_at,status,difficulty,ruleset_id,ruleset_label,summary,end_reason")
        .eq("id", matchId)
        .maybeSingle();
      if (!error && data) {
        match = data;
        if (!matches.some(m => m.id === data.id)) matches.unshift(data);
      }
    }

    if (!student) {
      const { data, error } = await sb()
        .from("student_profiles")
        .select("user_id,student_code,full_name,class_name,room_no,active")
        .eq("user_id", studentId)
        .maybeSingle();
      if (!error && data) {
        student = data;
        if (!students.some(s => s.user_id === data.user_id)) students.push(data);
      }
    }

    if (!match && liveRow) {
      match = {
        id: liveRow.match_id,
        student_user_id: liveRow.student_user_id,
        started_at: liveRow.updated_at,
        status: liveRow.status === "playing" ? "active" : "finished",
        difficulty: liveRow.difficulty,
        ruleset_id: liveRow.ruleset_id,
        ruleset_label: liveRow.ruleset_id === "PRIMARY_70" ? "ประถม 70 เบี้ย" : "มาตรฐาน 100 เบี้ย",
        final_player_score: liveRow.player_score,
        final_bot_score: liveRow.bot_score,
      };
    }

    if (!student && liveRow) {
      student = {
        user_id: liveRow.student_user_id,
        student_code: liveRow.student_code,
        full_name: liveRow.student_name || liveRow.student_code || "นักเรียน",
        class_name: liveRow.class_name,
        room_no: liveRow.room_no,
        active: true,
      };
    }

    return { match, student };
  }

  function isCriticalTurn(t) {
    if (!t || t.actor !== "player") return false;
    const dq = Number(t.decision_quality);
    const loss = Number(t.tactical_loss);
    const time = Number(t.decision_time_ms);
    return (Number.isFinite(loss) && loss >= 5) ||
      (Number.isFinite(dq) && dq < 60) ||
      (Number.isFinite(time) && time >= 45000);
  }

  function replayIndices() {
    const all = replayTurns.map((_,i)=>i);
    return replayCriticalOnly ? all.filter(i=>isCriticalTurn(replayTurns[i])) : all;
  }

  function replayBonusClass(r,c) {
    if (typeof AMATH_DATA === "undefined") return "";
    const bonus = AMATH_DATA.bonusAt?.(r,c);
    return bonus ? ` bonus-${bonus.toLowerCase()}` : "";
  }

  function renderReplayBoard(turn) {
    const el = $("replay-board");
    const raw = turn?.raw || {};
    const board = raw.boardSnapshotAfter || raw.boardSnapshotBefore || null;
    const placements = Array.isArray(raw.placements) ? raw.placements : [];
    const placementSet = new Set(placements.map(p=>`${p.r}:${p.c}`));

    if (!Array.isArray(board)) {
      el.className = "replay-board board-unavailable";
      el.innerHTML = '<div><strong>ไม่มี Board Snapshot</strong><small>เกมนี้ถูกบันทึกก่อนระบบ Replay 0.7 จึงไม่สร้างกระดานย้อนหลังขึ้นมาเอง</small></div>';
      return false;
    }

    el.className = "replay-board";
    let html = "";
    for (let r=0;r<15;r++) {
      for (let col=0;col<15;col++) {
        const cell = board?.[r]?.[col] || null;
        const center = r===7 && col===7;
        const fresh = placementSet.has(`${r}:${col}`);
        const cls = `replay-cell${replayBonusClass(r,col)}${center?" center":""}${cell?" has-tile":""}${fresh?" replay-new-tile":""}`;
        html += `<div class="${cls}" title="${r+1},${col+1}">${cell ? `<span>${cell.c ?? cell.resolvedChar ?? cell.f ?? cell.face ?? ""}</span><small>${cell.p ?? cell.points ?? ""}</small>` : ""}</div>`;
      }
    }
    el.innerHTML = html;
    return true;
  }

  function renderReplayRack(turn) {
    const rack = turn?.rack_before || turn?.raw?.rackBefore || [];
    $("replay-rack-before").innerHTML = Array.isArray(rack) && rack.length
      ? rack.map(x=>`<span class="pit-rack-tile">${typeof x === "string" ? x : (x?.face || x?.c || "?")}</span>`).join("")
      : '<span class="replay-muted">—</span>';
  }

  function renderReplayTimeline() {
    const indices = replayIndices();
    const el = $("replay-timeline");
    el.innerHTML = indices.length ? indices.map(i=>{
      const t=replayTurns[i];
      const active=i===replayIndex;
      const critical=isCriticalTurn(t);
      return `<button class="replay-turn-row ${active?"active":""} ${critical?"critical":""}" data-index="${i}">
        <span class="replay-turn-no">T${t.turn_number ?? i+1}</span>
        <span><strong>${t.actor==="player"?"นักเรียน":"บอท"}</strong><small>${t.equation || t.event_type || "move"}</small></span>
        <span class="replay-turn-score">${Number(t.move_score)>0?"+":""}${t.move_score ?? 0}</span>
        ${critical?'<i title="Critical Turn">!</i>':""}
      </button>`;
    }).join("") : '<p class="empty">ไม่พบ Critical Turn ตามเกณฑ์ปัจจุบัน</p>';

    el.querySelectorAll(".replay-turn-row").forEach(btn=>{
      btn.addEventListener("click",()=>{ replayIndex=Number(btn.dataset.index); renderReplay(); });
    });
  }

  function replayMetric(label,value,sub="") {
    return `<div class="replay-metric"><small>${label}</small><strong>${value}</strong>${sub?`<span>${sub}</span>`:""}</div>`;
  }

  function renderReplayInspector(turn,hasBoard) {
    if (!turn) return;
    const raw=turn.raw || {};
    const decisionSec=turn.decision_time_ms == null ? "—" : (Number(turn.decision_time_ms)/1000).toFixed(1)+"s";
    const dq=turn.decision_quality == null ? "—" : Math.round(Number(turn.decision_quality))+"%";
    const loss=turn.tactical_loss == null ? "—" : Number(turn.tactical_loss).toFixed(1);
    const chosen=turn.move_value == null ? "—" : Number(turn.move_value).toFixed(1);
    const best=turn.best_move_value == null ? "—" : Number(turn.best_move_value).toFixed(1);

    $("replay-metrics").innerHTML =
      replayMetric("คะแนนตานี้",turn.move_score ?? 0) +
      replayMetric("Decision Quality",dq) +
      replayMetric("Tactical Loss",loss) +
      replayMetric("Decision Time",decisionSec) +
      replayMetric("Move Value",chosen) +
      replayMetric("Best Value",best);

    const delta = turn.move_value != null && turn.best_move_value != null
      ? Math.max(0,Number(turn.best_move_value)-Number(turn.move_value))
      : null;

    $("replay-move-box").innerHTML = `
      <small>MOVE / EVENT</small>
      <strong>${turn.equation || turn.event_type || "—"}</strong>
      <div class="replay-tags">
        <span>${turn.actor === "player" ? "นักเรียน" : "บอท"}</span>
        ${turn.suggested_mode ? `<span>AMATS ${turn.suggested_mode}</span>` : ""}
        ${isCriticalTurn(turn) ? '<span class="critical-tag">Critical</span>' : ""}
      </div>
      ${delta != null && delta > 0 ? `<p>มูลค่าการเดินต่ำกว่าค่าทางเลือกที่ดีที่สุดที่ engine ประเมินไว้ <b>${delta.toFixed(1)}</b> หน่วย โดยข้อมูลปัจจุบันยังไม่ได้เก็บสมการของทางเลือกนั้น จึงไม่แสดงคำตอบที่ไม่ได้บันทึกไว้</p>` : ""}
    `;

    $("replay-data-note").innerHTML = hasBoard
      ? '<span class="data-ok">● Board snapshot จากเกมจริง</span>'
      : '<span class="data-limited">● Replay จำกัด: ไม่มี board snapshot สำหรับ Turn นี้</span>';
  }

  function renderReplay() {
    if (!replayTurns.length) return;
    replayIndex=Math.max(0,Math.min(replayTurns.length-1,replayIndex));
    const turn=replayTurns[replayIndex];
    const visible=replayIndices();
    const visiblePos=Math.max(0,visible.indexOf(replayIndex));
    $("replay-position").textContent = visible.length ? `${visiblePos+1} / ${visible.length}` : "0 / 0";
    $("replay-turn-title").textContent = `Turn ${turn.turn_number ?? replayIndex+1} · ${turn.equation || turn.event_type || "move"}`;
    $("replay-actor").className = `status ${turn.actor==="player"?"playing":""}`;
    $("replay-actor").textContent = turn.actor==="player" ? "นักเรียน" : "บอท";
    const hasBoard=renderReplayBoard(turn);
    renderReplayRack(turn);
    renderReplayInspector(turn,hasBoard);
    renderReplayTimeline();

    const indices=replayIndices();
    const pos=indices.indexOf(replayIndex);
    $("replay-prev").disabled = pos <= 0;
    $("replay-next").disabled = pos < 0 || pos >= indices.length-1;
  }

  function moveReplay(step) {
    const indices=replayIndices();
    if (!indices.length) return;
    let pos=indices.indexOf(replayIndex);
    if (pos<0) pos=0;
    pos=Math.max(0,Math.min(indices.length-1,pos+step));
    replayIndex=indices[pos];
    renderReplay();
  }

  async function openMatchReplay(matchId,studentId,options = {}) {
    const { match, student } = await resolveReplayContext(matchId, studentId, options.liveRow || null);
    if (!match || !student) return;

    replayMatch=match;
    replayStudent=student;
    replayTurns=[];
    replayIndex=0;
    replayCriticalOnly=false;
    replayReturnView=options.returnView || "student-detail";
    replayRequestedTurnId=options.turnId ?? null;
    $("replay-critical").classList.remove("active");
    $("replay-title").textContent = `${student.full_name} · Match Replay`;

    const currentRow = options.liveRow || null;
    const playerScore = match.final_player_score ?? currentRow?.player_score ?? 0;
    const botScore = match.final_bot_score ?? currentRow?.bot_score ?? 0;
    const matchStatus = match.status === "active" || currentRow?.status === "playing" ? "กำลังเล่นสด" : "จบแล้ว";
    $("replay-meta").textContent = `${dateLabel(match.started_at)} · ${match.ruleset_label || match.ruleset_id || "A-Math"} · ${match.difficulty || "—"} · ${playerScore}–${botScore} · ${matchStatus}`;
    $("replay-timeline").innerHTML='<p class="empty">กำลังโหลด Replay...</p>';
    setView("replay");

    const {data,error}=await sb()
      .from("turn_events")
      .select("id,match_id,actor,turn_number,event_type,occurred_at,move_score,equation,decision_time_ms,decision_quality,tactical_loss,move_value,best_move_value,gap_before,gap_after,rack_before,rack_after,suggested_mode,raw")
      .eq("match_id",matchId)
      .order("id",{ascending:true});

    if(error){
      console.warn(error);
      $("replay-timeline").innerHTML='<p class="empty">โหลด Replay ไม่สำเร็จ</p>';
      return;
    }

    replayTurns=data || [];
    if(!replayTurns.length){
      $("replay-timeline").innerHTML='<p class="empty">แมตช์นี้ยังไม่มี Turn Telemetry</p>';
      $("replay-board").className="replay-board board-unavailable";
      $("replay-board").textContent="ไม่มีข้อมูล Replay";
      return;
    }

    if (replayRequestedTurnId != null) {
      const target = replayTurns.findIndex(t => Number(t.id) === Number(replayRequestedTurnId));
      if (target >= 0) replayIndex = target;
    } else if (options.returnView === "pitwall") {
      replayIndex = replayTurns.length - 1;
    }

    replayRequestedTurnId = null;
    renderReplay();
  }

  function renderStudents() {
    const q = $("student-search").value.trim().toLowerCase();
    const rows = students.filter(s => `${s.student_code} ${s.full_name} ${s.class_name} ${s.room_no}`.toLowerCase().includes(q));
    $("students-table").innerHTML = `
      <div class="student-row header"><span>นักเรียน</span><span>เกม</span><span>Win%</span><span>Avg Score</span><span>สถานะ</span></div>
      ${rows.map(s => {
        const st = studentStats(s.user_id);
        return `<button class="student-row" data-id="${s.user_id}">
          <span><strong>${s.full_name}</strong><small>${s.student_code} · ${s.class_name || ""}/${s.room_no || ""}</small></span>
          <span>${st.games}</span><span>${Math.round(st.winRate)}%</span><span>${st.avg.toFixed(1)}</span>
          <span>${s.active ? "ใช้งาน" : "ปิด"}</span>
        </button>`;
      }).join("")}`;

    document.querySelectorAll(".student-row[data-id]").forEach(row => {
      row.addEventListener("click", () => openStudentDeepAnalysis(row.dataset.id));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initAuth();
    document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click",()=>setView(b.dataset.view)));
    document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click",()=>setView(b.dataset.open)));
    $("live-search").addEventListener("input",renderLiveList);
    $("live-status-filter").addEventListener("change",renderLiveList);
    $("live-sort").addEventListener("change",renderLiveList);
    $("student-search").addEventListener("input",renderStudents);
    $("btn-refresh-selected").addEventListener("click",()=>refreshSelectedTelemetry(true));
    const tickPitClock = () => {
      const el = $("pitwall-clock");
      if (el) el.textContent = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    };
    tickPitClock();
    setInterval(tickPitClock,1000);
    $("student-detail-back").addEventListener("click",()=>setView("students"));
    $("replay-back").addEventListener("click",()=>{
      const target = replayReturnView || "student-detail";
      setView(target);
      if (target === "pitwall") {
        const row = selectedRow();
        if (row) {
          renderLiveDetail(row);
          renderTelemetryPanels();
        }
      }
    });
    $("replay-prev").addEventListener("click",()=>moveReplay(-1));
    $("replay-next").addEventListener("click",()=>moveReplay(1));
    $("replay-critical").addEventListener("click",()=>{
      replayCriticalOnly=!replayCriticalOnly;
      $("replay-critical").classList.toggle("active",replayCriticalOnly);
      const indices=replayIndices();
      if(indices.length && !indices.includes(replayIndex)) replayIndex=indices[0];
      renderReplay();
    });
  });
})();