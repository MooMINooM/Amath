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
    const { data, error } = await sb()
      .from("live_sessions")
      .select("*")
      .order("updated_at", { ascending:false });
    if (error) return console.warn(error);
    liveRows = data || [];
    renderLiveList();
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
        <span class="roster-person"><strong>${r.student_code || "—"} · ${r.student_name || "นักเรียน"}</strong><small>${r.class_name || ""}${r.room_no ? "/" + r.room_no : ""}</small></span>
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
      </div>`;

    $("board-turn-badge").textContent = active;
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
    $("pit-recent-moves").innerHTML = moves.length ? moves.map(t => `<div class="move-row">
      <span class="turn">T${t.turn_number ?? "—"}</span>
      <small>${t.actor === "player" ? "นักเรียน" : "บอท"}</small>
      <span class="eq">${t.equation || t.event_type || "move"}</span>
      <span class="score">${t.move_score > 0 ? "+" : ""}${t.move_score ?? 0}</span>
    </div>`).join("") : '<p class="empty">ยังไม่มีการเดิน</p>';
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
      sb().from("matches").select("student_user_id,result,final_player_score,final_bot_score,started_at,status").order("started_at",{ascending:false}),
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
  });
})();