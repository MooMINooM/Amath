(() => {
  let teacher = null;
  let liveRows = [];
  let students = [];
  let matches = [];
  let liveChannel = null;

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
        const detail = $("live-detail");
        if (detail.dataset.studentId === row.student_user_id) renderLiveDetail(row);
      })
      .subscribe();
  }

  function liveFiltered() {
    const q = $("live-search").value.trim().toLowerCase();
    const status = $("live-status-filter").value;
    return liveRows.filter(r => {
      const text = `${r.student_code || ""} ${r.student_name || ""} ${r.class_name || ""} ${r.room_no || ""}`.toLowerCase();
      return (!q || text.includes(q)) && (status === "all" || r.status === status);
    });
  }

  function renderLiveList() {
    const rows = liveFiltered();
    $("live-count").textContent = liveRows.filter(r => r.status === "playing").length;
    $("live-list").innerHTML = rows.length ? rows.map(r => {
      const gap = (r.player_score || 0) - (r.bot_score || 0);
      return `<button class="live-card" data-id="${r.student_user_id}">
        <div class="live-card-head"><strong>${r.student_name || r.student_code || "นักเรียน"}</strong><span class="status ${r.status}">${r.status === "playing" ? "LIVE" : r.status}</span></div>
        <small>${r.student_code || ""} · ${r.class_name || ""}/${r.room_no || ""}</small>
        <div class="live-mini-grid">
          <span><b>${r.player_score ?? 0}</b><small>คะแนน</small></span>
          <span><b class="${gap < 0 ? "negative" : ""}">${gap > 0 ? "+" : ""}${gap}</b><small>GAP</small></span>
          <span><b>${fmtTime(r.player_time_ms)}</b><small>เวลา</small></span>
        </div>
      </button>`;
    }).join("") : '<p class="empty">ยังไม่มี Live Session</p>';

    document.querySelectorAll(".live-card").forEach(btn => btn.addEventListener("click", () => {
      const row = liveRows.find(x => x.student_user_id === btn.dataset.id);
      if (row) renderLiveDetail(row);
    }));
  }

  function renderBoard(board) {
    if (!Array.isArray(board)) return '<div class="board-mini-empty">ไม่มี snapshot</div>';
    return `<div class="board-mini">${board.flatMap((row,r) => row.map((cell,c) =>
      `<div class="mini-cell ${cell ? "filled" : ""}" title="${r+1},${c+1}">${cell?.c ?? ""}</div>`
    )).join("")}</div>`;
  }

  function metric(label, value, suffix="", cls="") {
    return `<div class="metric"><small>${label}</small><strong class="${cls}">${value}${suffix}</strong></div>`;
  }

  function renderLiveDetail(r) {
    const el = $("live-detail");
    el.dataset.studentId = r.student_user_id;
    el.className = "live-detail";
    const gap = (r.player_score || 0) - (r.bot_score || 0);
    el.innerHTML = `
      <div class="detail-head">
        <div><p class="eyebrow">LIVE STUDENT</p><h3>${r.student_name || "นักเรียน"}</h3><small>${r.student_code || ""} · ${r.class_name || ""}/${r.room_no || ""}</small></div>
        <span class="status ${r.status}">${r.status === "playing" ? "LIVE" : r.status}</span>
      </div>
      <div class="detail-grid">
        <div class="board-card">${renderBoard(r.board_snapshot)}</div>
        <div class="metrics-panel">
          <div class="metric-grid">
            ${metric("SCORE", r.player_score ?? 0)}
            ${metric("BOT", r.bot_score ?? 0)}
            ${metric("GAP", (gap>0?"+":"")+gap, "", gap<0?"negative":"")}
            ${metric("TIME", fmtTime(r.player_time_ms))}
            ${metric("DQ", pct(r.decision_quality))}
            ${metric("LOSS", r.tactical_loss == null ? "—" : Number(r.tactical_loss).toFixed(1))}
            ${metric("WIN", pct(r.win_probability))}
            ${metric("RACK", pct(r.rack_quality))}
          </div>
          <div class="bars">
            <label>Decision Quality <span>${pct(r.decision_quality)}</span></label><div><i style="width:${Math.max(0,Math.min(100,Number(r.decision_quality)||0))}%"></i></div>
            <label>Win Probability <span>${pct(r.win_probability)}</span></label><div><i style="width:${Math.max(0,Math.min(100,Number(r.win_probability)||0))}%"></i></div>
            <label>Rack Quality <span>${pct(r.rack_quality)}</span></label><div><i style="width:${Math.max(0,Math.min(100,Number(r.rack_quality)||0))}%"></i></div>
          </div>
          <div class="last-move"><small>LAST MOVE</small><strong>${r.last_equation || "—"}</strong><span>${r.last_move_score == null ? "" : "+"+r.last_move_score}</span></div>
        </div>
      </div>`;
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
    $("student-search").addEventListener("input",renderStudents);
  });
})();