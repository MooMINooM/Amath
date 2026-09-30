(() => {
  let teacher = null;
  let liveRows = [];
  let students = [];
  let matches = [];
  let liveChannel = null;
  let turnChannel = null;
  let broadcastChannel = null;
  let pitwallSafetyInterval = null;
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
  let rosterClassSignature = "";
  let deepAnalysisRequest = 0;
  let showAllPitMoves = false;

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

  function projectedRemaining(row, side) {
    const base = side === "player" ? row?.player_time_ms : row?.bot_time_ms;
    if (base == null) return null;
    if (row?.status !== "playing" || row?.active_side !== side || row?._source === "matches-fallback") return Number(base);
    const receivedAt = Number(row._received_at) || Date.now();
    return Number(base) - Math.max(0, Date.now() - receivedAt);
  }

  function tickSpectatorClocks() {
    if (!$("view-pitwall") || $("view-pitwall").hidden) return;
    document.querySelectorAll(".roster-time[data-student-id]").forEach(el => {
      const row = liveRows.find(r => r.student_user_id === el.dataset.studentId);
      if (row) el.textContent = fmtTime(projectedRemaining(row, "player"));
    });
    const row = selectedRow();
    if (row) {
      const p = $("spectator-player-time");
      const b = $("spectator-bot-time");
      if (p) p.textContent = fmtTime(projectedRemaining(row, "player"));
      if (b) b.textContent = fmtTime(projectedRemaining(row, "bot"));
      const duration = AMATH_RULESETS.ALL[row.ruleset_id]?.clockMinutes * 60000;
      if (duration) {
        const playerBar = $("pit-player-meter");
        const botBar = $("pit-bot-meter");
        if (playerBar) playerBar.style.width = `${Math.max(0,Math.min(100,projectedRemaining(row,"player") / duration * 100))}%`;
        if (botBar) botBar.style.width = `${Math.max(0,Math.min(100,projectedRemaining(row,"bot") / duration * 100))}%`;
      }
    }
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
      tactical_loss: m.summary?.avgTacticalLossPctV2 ?? m.summary?.avgTacticalLoss ?? null,
      win_probability: null,
      pressure_level: m.summary?.avgPressure ?? null,
      risk_level: m.summary?.avgRisk ?? null,
      rack_quality: m.summary?.avgRackQuality ?? null,
      board_snapshot: null,
      rack_snapshot: null,
      last_equation: null,
      last_move_score: null,
      updated_at: m.updated_at || m.finished_at || m.started_at,
      _source: "matches-fallback",
    };
  }

  function setView(name) {
    document.body.classList.toggle("pitwall-mode", name === "pitwall");
    document.body.classList.toggle("deep-analysis-mode", name === "student-detail");
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
    subscribeTurnEvents();
    subscribePitwallBroadcast();
    startPitwallSafetySync();
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
      if (turnChannel) await sb().removeChannel(turnChannel);
      if (broadcastChannel) await sb().removeChannel(broadcastChannel);
      clearInterval(pitwallSafetyInterval);
      pitwallSafetyInterval = null;
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
      const now = Date.now();
      const previous = new Map(liveRows.map(r => [r.student_user_id, r]));
      liveRows = (liveResult.data || []).map(dbRow => {
        const current = previous.get(dbRow.student_user_id);
        const dbTs = new Date(dbRow.updated_at || 0).getTime();
        const currentTs = new Date(current?.updated_at || 0).getTime();
        if (current?._source === "broadcast" && currentTs > dbTs) return current;
        return {
          ...current,
          ...dbRow,
          risk_level: current?.risk_level ?? dbRow.risk_level ?? null,
          analytics_version: current?.analytics_version ?? dbRow.analytics_version ?? null,
          _received_at: now
        };
      });
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
        liveRows = [...latestByStudent.values()].map(m => ({ ...fallbackRowFromMatch(m), _received_at: Date.now() }));
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
        const row = payload.new ? { ...payload.new, _received_at: Date.now() } : null;
        if (!row?.student_user_id) return;
        const idx = liveRows.findIndex(x => x.student_user_id === row.student_user_id);
        if (idx >= 0) {
          const current = liveRows[idx];
          liveRows[idx] = {
            ...current,
            ...row,
            risk_level: current?.risk_level ?? row.risk_level ?? null,
            analytics_version: current?.analytics_version ?? row.analytics_version ?? null,
          };
        } else liveRows.unshift(row);
        liveRows.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
        renderLiveList();
        if ($("last-refresh")) $("last-refresh").textContent = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
        if (selectedLiveId === row.student_user_id) {
          renderLiveDetail(row);
          refreshSelectedTelemetry(false);
        }
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") setPitwallDataStatus("Realtime เชื่อมต่อแล้ว", "ok");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setPitwallDataStatus("Realtime ขัดข้อง · กำลังใช้ข้อมูลล่าสุด", "warn");
      });
  }

  function subscribeTurnEvents() {
    if (turnChannel) sb().removeChannel(turnChannel);
    turnChannel = sb()
      .channel("teacher-pitwall-turn-events")
      .on("postgres_changes", { event:"INSERT", schema:"public", table:"turn_events" }, payload => {
        const turn = payload.new;
        const row = selectedRow();
        if (!turn?.match_id || !row?.match_id || turn.match_id !== row.match_id) return;
        mergeSelectedTurn(turn);
        applyTurnDerivedState(row, selectedTurns);
        renderLiveDetail(row);
        renderTelemetryPanels();
        if ($("last-refresh")) $("last-refresh").textContent = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
      })
      .subscribe(status => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Pitwall] turn_events realtime unavailable; safety sync will continue");
        }
      });
  }

  function startPitwallSafetySync() {
    clearInterval(pitwallSafetyInterval);
    pitwallSafetyInterval = setInterval(async () => {
      const view = $("view-pitwall");
      if (!teacher || !view || view.hidden) return;
      await refreshLive();
      if (selectedLiveId) await refreshSelectedTelemetry(false);
    }, 3000);
  }

  function applyTurnDerivedState(row, turns) {
    if (!row || !Array.isArray(turns) || !turns.length) return row;
    let playerScore = 0;
    let botScore = 0;
    for (const t of turns) {
      const score = Number(t.move_score) || 0;
      if (t.actor === "player") playerScore += score;
      else if (t.actor === "bot") botScore += score;
    }
    const last = turns[turns.length - 1] || null;
    const lastPlayer = [...turns].reverse().find(t => t.actor === "player") || null;

    // Turn telemetry is newer/more granular than match-history fallback.
    if (row._source === "matches-fallback" || row.player_score == null || row.turn_number == null) {
      row.player_score = playerScore;
      row.bot_score = botScore;
      row.turn_number = Math.max(...turns.map(t => Number(t.turn_number)||0), 0);
    }
    if (last) {
      row.last_equation = last.equation || last.event_type || row.last_equation;
      row.last_move_score = last.move_score ?? row.last_move_score;
    }
    if (lastPlayer) {
      const raw = lastPlayer.raw || {};
      row.decision_quality = raw.decisionQualityV2 ?? lastPlayer.decision_quality ?? row.decision_quality;
      row.tactical_loss = raw.tacticalLossPctV2 ?? lastPlayer.tactical_loss ?? row.tactical_loss;
      row.pressure_level = raw.pressureV2 ?? row.pressure_level;
      row.risk_level = raw.riskV2 ?? row.risk_level;
      row.rack_quality = raw.rackQualityAfter ?? row.rack_quality;
      if ((!row.rack_snapshot || row._source === "matches-fallback") && Array.isArray(lastPlayer.rack_after)) {
        row.rack_snapshot = lastPlayer.rack_after.map(x => typeof x === "string" ? { face:x, resolvedChar:x, points:null } : x);
      }
    }
    return row;
  }

  function turnIdentity(t) {
    return [
      t?.match_id || "",
      t?.actor || "",
      t?.turn_number ?? "",
      t?.occurred_at || "",
      t?.equation || t?.event_type || "",
    ].join("|");
  }

  function mergeSelectedTurn(turn) {
    if (!turn) return;
    const key = turnIdentity(turn);
    const idx = selectedTurns.findIndex(t => turnIdentity(t) === key);
    if (idx >= 0) {
      selectedTurns[idx] = { ...selectedTurns[idx], ...turn };
    } else {
      selectedTurns.push(turn);
    }
    selectedTurns.sort((a,b) => {
      const ai = Number.isFinite(Number(a.id)) ? Number(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = Number.isFinite(Number(b.id)) ? Number(b.id) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return new Date(a.occurred_at || 0) - new Date(b.occurred_at || 0);
    });
  }

  function applyBroadcastLiveRow(payload) {
    if (!payload?.student_user_id) return;
    const row = { ...payload, _received_at: Date.now(), _source: "broadcast" };
    const idx = liveRows.findIndex(x => x.student_user_id === row.student_user_id);
    if (idx >= 0) liveRows[idx] = { ...liveRows[idx], ...row };
    else liveRows.unshift(row);

    renderLiveList();

    if (!selectedLiveId) selectedLiveId = row.student_user_id;
    if (selectedLiveId === row.student_user_id) {
      const current = selectedRow();
      renderLiveDetail(current);
      renderTelemetryPanels();
    }
    if ($("last-refresh")) $("last-refresh").textContent = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    setPitwallDataStatus("Broadcast สด · เชื่อมต่อแล้ว", "ok");
  }

  function applyBroadcastTurn(turn) {
    const row = selectedRow();
    if (!turn?.match_id || !row?.match_id || turn.match_id !== row.match_id) return;
    mergeSelectedTurn(turn);
    applyTurnDerivedState(row, selectedTurns);
    renderLiveList();
    renderLiveDetail(row);
    renderTelemetryPanels();
    if ($("last-refresh")) $("last-refresh").textContent = new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  }

  function subscribePitwallBroadcast() {
    if (broadcastChannel) sb().removeChannel(broadcastChannel);
    broadcastChannel = sb()
      .channel("amath-pitwall-broadcast", {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event:"live_state" }, ({ payload }) => applyBroadcastLiveRow(payload))
      .on("broadcast", { event:"turn_event" }, ({ payload }) => applyBroadcastTurn(payload))
      .subscribe(status => {
        if (status === "SUBSCRIBED") setPitwallDataStatus("Broadcast สด · เชื่อมต่อแล้ว", "ok");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setPitwallDataStatus("Broadcast ขัดข้อง · ใช้ Realtime DB สำรอง", "warn");
        }
      });
  }

  function stableStudentCompare(a,b) {
    const codeA = String(a?.student_code || "");
    const codeB = String(b?.student_code || "");
    const codeCmp = codeA.localeCompare(codeB, "th", { numeric:true, sensitivity:"base" });
    if (codeCmp !== 0) return codeCmp;
    const nameCmp = String(a?.student_name || "").localeCompare(String(b?.student_name || ""), "th", { sensitivity:"base" });
    if (nameCmp !== 0) return nameCmp;
    return String(a?.student_user_id || "").localeCompare(String(b?.student_user_id || ""));
  }

  function liveFiltered() {
    const classroom = $("live-class-filter").value;
    const status = $("live-status-filter").value;
    const sort = $("live-sort")?.value || "score";
    const rows = liveRows.filter(r => {
      const classKey = [r.class_name,r.room_no].filter(Boolean).join("/");
      return (classroom === "all" || classKey === classroom) && (status === "all" || r.status === status);
    });
    rows.sort((a,b) => {
      if (sort === "time") {
        const diff = (projectedRemaining(a,"player") ?? Infinity) - (projectedRemaining(b,"player") ?? Infinity);
        return diff || stableStudentCompare(a,b);
      }
      if (sort === "recent") {
        const diff = new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
        return diff || stableStudentCompare(a,b);
      }
      const scoreDiff = (Number(b.player_score) || 0) - (Number(a.player_score) || 0);
      return scoreDiff || stableStudentCompare(a,b);
    });
    return rows;
  }

  function rosterRowHtml(r,idx) {
    const isSelected = selectedLiveId === r.student_user_id;
    const classText = `${r.class_name || ""}${r.room_no ? " · ห้อง " + r.room_no : ""}${r._source === "matches-fallback" ? " · HISTORY" : ""}`;
    return `<button class="live-card ${isSelected ? "selected" : ""}" data-id="${r.student_user_id}">
      <span class="roster-rank">${idx + 1}</span>
      <span class="roster-code">${r.student_code || "—"}</span>
      <span class="roster-person"><strong>${r.student_name || "นักเรียน"}</strong><small>${classText}</small></span>
      <span class="roster-score">${r.player_score ?? 0}</span>
      <span class="roster-time" data-student-id="${r.student_user_id}">${fmtTime(projectedRemaining(r,"player"))}</span>
      <span class="roster-status"><span class="status ${r.status}" aria-label="${r.status === "playing" ? "กำลังเล่น" : r.status === "finished" ? "จบแล้ว" : "ขาดการเชื่อมต่อ"}"></span></span>
    </button>`;
  }

  function patchRosterRow(btn,r,idx) {
    btn.classList.toggle("selected", selectedLiveId === r.student_user_id);
    btn.dataset.id = r.student_user_id;
    const rank = btn.querySelector(".roster-rank");
    const code = btn.querySelector(".roster-code");
    const personName = btn.querySelector(".roster-person strong");
    const personMeta = btn.querySelector(".roster-person small");
    const score = btn.querySelector(".roster-score");
    const time = btn.querySelector(".roster-time");
    const status = btn.querySelector(".roster-status .status");
    if (rank) rank.textContent = idx + 1;
    if (code) code.textContent = r.student_code || "—";
    if (personName) personName.textContent = r.student_name || "นักเรียน";
    if (personMeta) personMeta.textContent = `${r.class_name || ""}${r.room_no ? " · ห้อง " + r.room_no : ""}${r._source === "matches-fallback" ? " · HISTORY" : ""}`;
    if (score) score.textContent = r.player_score ?? 0;
    if (time) {
      time.dataset.studentId = r.student_user_id;
      time.textContent = fmtTime(projectedRemaining(r,"player"));
    }
    if (status) {
      status.className = `status ${r.status || ""}`;
      status.setAttribute("aria-label", r.status === "playing" ? "กำลังเล่น" : r.status === "finished" ? "จบแล้ว" : "ขาดการเชื่อมต่อ");
    }
  }

  function renderLiveList() {
    const classFilter = $("live-class-filter");
    const selectedClass = classFilter.value;
    const classes = [...new Set(liveRows.map(r=>[r.class_name,r.room_no].filter(Boolean).join("/")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th"));
    const classSignature = classes.join("|");
    if (classSignature !== rosterClassSignature) {
      classFilter.replaceChildren(new Option("ทุกชั้นเรียน","all"),...classes.map(name=>new Option(name,name)));
      rosterClassSignature = classSignature;
    }
    classFilter.value = classes.includes(selectedClass) ? selectedClass : "all";

    const rows = liveFiltered();
    $("live-count").textContent = liveRows.filter(r => r.status === "playing").length;
    $("total-count").textContent = liveRows.length;
    if ($("roster-total")) $("roster-total").textContent = `ทั้งหมด ${rows.length} คน`;

    const list = $("live-list");
    if (!rows.length) {
      if (!list.querySelector(".empty")) list.innerHTML = '<p class="empty">ยังไม่มี Live Session</p>';
      return;
    }

    const existing = [...list.querySelectorAll(".live-card")];
    const sameOrder = existing.length === rows.length &&
      existing.every((btn,idx) => btn.dataset.id === rows[idx].student_user_id);

    if (!sameOrder) {
      list.innerHTML = rows.map(rosterRowHtml).join("");
      list.querySelectorAll(".live-card").forEach(btn => btn.addEventListener("click", () => {
        selectLiveStudent(btn.dataset.id);
      }));
      return;
    }

    existing.forEach((btn,idx) => patchRosterRow(btn,rows[idx],idx));
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
    el.innerHTML = rack.map(t => `<span class="pit-rack-tile ${Number(t.points ?? t.p) >= 4 ? "high-value" : ""}">${t.resolvedChar || t.face || (t.kind === "blank" ? "?" : "")}</span>`).join("");
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
    const vals = nums.filter(v => v != null && Number.isFinite(Number(v))).map(Number);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  }

  function selectedRow() {
    return liveRows.find(r => r.student_user_id === selectedLiveId) || null;
  }

  function selectLiveStudent(studentId) {
    const previousMatchId = selectedRow()?.match_id || null;
    selectedLiveId = studentId;
    const row = selectedRow();
    if (row?.match_id !== previousMatchId) selectedTurns = [];
    renderLiveList();
    if (!row) return;
    renderLiveDetail(row);
    refreshSelectedTelemetry(true);
  }

  function statusSparkline(actor, currentTurn) {
    let score = 0;
    const values = [0];
    if (Number(currentTurn) <= 0) return '<span class="status-graph-empty" aria-label="ยังไม่มีข้อมูลแนวโน้ม"></span>';
    selectedTurns.filter(t => Number(t.turn_number) > 0 && (actor === "gap" || t.actor === actor) && (t.event_type || "move") === "move").forEach(t => {
      score += (actor === "gap" && t.actor === "bot" ? -1 : 1) * (Number(t.move_score) || 0);
      values.push(score);
    });
    if (values.length < 2) return '<span class="status-graph-empty" aria-label="ยังไม่มีข้อมูลแนวโน้ม"></span>';
    const recent = values.slice(-12);
    const low = Math.min(...recent);
    const range = Math.max(1,Math.max(...recent)-low);
    const points = recent.map((v,i)=>`${(i/(recent.length-1)*100).toFixed(1)},${(21-(v-low)/range*17).toFixed(1)}`).join(" ");
    return `<svg class="status-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label="แนวโน้ม${actor === "gap" ? "ผลต่างคะแนน" : actor === "player" ? "คะแนนนักเรียน" : "คะแนนบอท"}"><path d="M0 23H100"/><polyline points="${points}"/></svg>`;
  }

  function statusCard(label,value,icon,tone,footer="",detail="") {
    return `<div class="console-stat status-card ${tone}"><div class="status-card-head"><small>${label}</small><i aria-hidden="true">${icon}</i></div><div class="status-card-value"><strong>${value}</strong>${detail}</div>${footer}</div>`;
  }

  function statusMeter(id,value,tone="") {
    const width = value == null ? 0 : Math.max(0,Math.min(100,value));
    return `<div class="status-meter ${tone}"><i id="${id}" style="width:${width}%"></i></div>`;
  }

  function renderLiveDetail(r) {
    const gap = (r.player_score || 0) - (r.bot_score || 0);
    const active = r.active_side === "player" ? "ตาของนักเรียน" : r.active_side === "bot" ? "ตาของบอท" : (r._source === "matches-fallback" ? "ข้อมูลย้อนหลัง" : "—");
    const rulesetLabel = r.ruleset_id === "PRIMARY_70" ? "ประถม 70 เบี้ย" : r.ruleset_id === "STANDARD_100" ? "มาตรฐาน 100 เบี้ย" : (r.ruleset_id || "—");
    const statusLabel = r.status === "playing" ? "กำลังเล่นอยู่" : r.status === "finished" ? "จบแล้ว" : (r.status || "—");

    $("selected-player-card").className = "pit-card ref-player-card";
    $("selected-player-card").innerHTML = `
      <div class="ref-player-summary">
        <div class="selected-person">
          <img class="selected-avatar" src="assets/student-avatar.svg" alt="">
          <div>
            <small class="spectator-code">${r.student_code || "—"}</small>
            <h3>${r.student_name || "นักเรียน"}</h3>
            <p>${r.class_name || "—"} &nbsp;│&nbsp; ห้องเรียน ${r.room_no || "—"}</p>
          </div>
        </div>
        <div class="ref-profile-meta">
          <div><span class="ref-meta-icon">⚙</span><strong>${rulesetLabel}</strong></div>
          <div><span class="ref-meta-icon">▥</span><strong>${({Rookie:"Beginner",Standard:"Intermediate",Master:"Advanced"})[r.difficulty] || r.difficulty || "—"}</strong></div>
          <button id="pit-open-student" class="ref-analysis-btn" type="button">▥ &nbsp; Deep Analysis</button>
        </div>
      </div>`;
    $("pit-open-student")?.addEventListener("click",()=>openStudentDeepAnalysis(r.student_user_id));

    $("pitwall-round").textContent = rulesetLabel;
    $("console-turn-badge").textContent = active;
    $("pitwall-bot-level").textContent = ({ Rookie:"Beginner", Standard:"Intermediate", Master:"Advanced" })[r.difficulty] || r.difficulty || "—";

    const playerLast = [...selectedTurns].reverse().find(t => t.actor === "player" && (t.event_type || "move") === "move");
    const botLast = [...selectedTurns].reverse().find(t => t.actor === "bot" && (t.event_type || "move") === "move");
    const clockMinutes = AMATH_RULESETS.ALL[r.ruleset_id]?.clockMinutes;
    const clockDuration = clockMinutes ? clockMinutes * 60000 : null;
    const playerTime = projectedRemaining(r,"player");
    const botTime = projectedRemaining(r,"bot");
    const ranking = [...liveRows].sort((a,b)=>(b.player_score||0)-(a.player_score||0)).findIndex(x=>x.student_user_id===r.student_user_id)+1;
    const lastDelta = (move,sign) => move?.move_score == null ? "" : `<span class="status-delta">${sign} ${sign === "▲" ? "+" : "−"}${Number(move.move_score)}</span>`;

    $("match-status-grid").innerHTML =
      statusCard("SCORE",r.player_score ?? 0,"◆","score-blue",statusSparkline("player",r.turn_number),lastDelta(playerLast,"▲")) +
      statusCard("BOT",r.bot_score ?? 0,"●","score-red",statusSparkline("bot",r.turn_number),lastDelta(botLast,"▼")) +
      statusCard("GAP",`${gap > 0 ? "+" : ""}${gap}`,"▥",gap < 0 ? "negative" : "positive",statusSparkline("gap",r.turn_number)) +
      statusCard("TIME",`<span id="spectator-player-time">${fmtTime(playerTime)}</span>`,"◷","time-blue",statusMeter("pit-player-meter",clockDuration && playerTime != null ? playerTime/clockDuration*100 : null)) +
      statusCard("BOT TIME",`<span id="spectator-bot-time">${fmtTime(botTime)}</span>`,"♙","time-bot",statusMeter("pit-bot-meter",clockDuration && botTime != null ? botTime/clockDuration*100 : null)) +
      statusCard("TURN",r.turn_number ?? 0,"◉","turn-purple",statusMeter("pit-turn-meter",Math.min(100,(r.turn_number || 0)/20*100))) +
      statusCard("RANK",ranking ? `${ranking}<span class="status-rank-total"> / ${liveRows.length}</span>` : "—","♛","rank-yellow") +
      statusCard("STATUS",r.status === "playing" ? "In Progress" : r.status === "finished" ? "Finished" : statusLabel,"●",r.status === "playing" ? "status-green" : "status-idle");

    renderPitRack(r.rack_snapshot);
    const rackQuality = Number(r.rack_quality);
    const hasRackQuality = r.rack_quality != null && Number.isFinite(rackQuality);
    $("pit-rack-quality").textContent = hasRackQuality ? `${Math.round(rackQuality)}/100` : "—";
    $("pit-rack-quality-bar").style.width = hasRackQuality ? `${Math.max(0,Math.min(100,rackQuality))}%` : "0%";
    $("rack-count").textContent = Array.isArray(r.rack_snapshot) ? `(${r.rack_snapshot.length} เบี้ย)` : "(— เบี้ย)";
    renderHeatmap(r.board_snapshot);

    const playerMoves = selectedTurns.filter(t => t.actor === "player" && (t.event_type || "move") === "move");
    renderAmatsLive(r, playerMoves);
    tickSpectatorClocks();
  }

  function renderAmatsLive(r,playerMoves) {
    const last = [...playerMoves].reverse()[0];
    const mode = last?.suggested_mode || null;
    const advice = {
      PRESS:"Look for the strongest scoring move this turn.",
      BUILD:"Build more scoring options for your next turn.",
      CONTROL:"Keep your score and rack in balance.",
      DENY:"Limit the bot's next scoring opportunity.",
      GUARD:"Protect the lead and reduce exposure.",
      RESET:"Improve the balance of tiles in your rack."
    };
    const gap = (r.player_score || 0) - (r.bot_score || 0);
    const dq = last?.decision_quality ?? r.decision_quality;
    const loss = last?.raw?.tacticalLossPctV2 ?? last?.tactical_loss ?? r.tactical_loss;
    const risk = last?.raw?.riskV2 ?? r.risk_level ?? null;
    const decisionTime = average(playerMoves.map(t=>t.decision_time_ms));
    const pace = decisionTime == null ? "—" : decisionTime < 10000 ? "FAST" : decisionTime < 25000 ? "STEADY" : "SLOW";
    const focus = ({PRESS:"SCORING",BUILD:"SETUP",CONTROL:"BALANCE",DENY:"DEFENSE",GUARD:"SAFETY",RESET:"RACK"})[mode] || "—";
    $("pit-amats").className = "amats-live";
    $("pit-amats").innerHTML = `
      <div class="amats-live-chips"><span class="amats-chip">GAP ${gap >= 0 ? "+" : ""}${gap}</span><span class="amats-chip">DQ ${pct(dq)}</span><span class="amats-chip">LOSS ${loss == null ? "—" : Number(loss).toFixed(1)+"%"}</span></div>
      <div class="amats-metric-grid">
        <div class="amats-metric"><small>MODE</small><strong>${mode || "—"}</strong><span>Suggested play</span></div>
        <div class="amats-metric"><small>RISK</small><strong>${risk == null ? "—" : Number(risk).toFixed(0)+"%"}</strong><span>Exposure + threat</span></div>
        <div class="amats-metric"><small>PACE</small><strong>${pace}</strong><span>${decisionTime == null ? "No timing yet" : `${(decisionTime/1000).toFixed(1)}s / turn`}</span></div>
        <div class="amats-metric"><small>NEXT FOCUS</small><strong>${focus}</strong><span>Next decision</span></div>
      </div><div class="amats-recommendation"><span aria-hidden="true">✦</span><p>${advice[mode] || "Waiting for a completed turn to recommend the next move."}</p></div>`;
  }

  function renderHeatmap(snapshot) {
    const el = $("pit-heatmap");
    $("heatmap-cols").innerHTML = Array.from({length:15},(_,i)=>`<span>${i+1}</span>`).join("");
    $("heatmap-rows").innerHTML = Array.from({length:15},(_,i)=>`<span>${String.fromCharCode(65+i)}</span>`).join("");
    if (!Array.isArray(snapshot)) { el.innerHTML = '<span class="heatmap-empty">ยังไม่มีข้อมูลกระดาน</span>'; return; }
    let html = "";
    for (let r=0;r<15;r++) {
      for (let c=0;c<15;c++) {
        let density = 0;
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
          if (snapshot?.[r+dr]?.[c+dc]) density++;
        }
        const lvl = density === 0 ? 0 : density <=2 ? 1 : density <=4 ? 2 : density <=6 ? 3 : 4;
        html += `<span class="heat-cell occupied-${lvl}" title="${String.fromCharCode(65+r)}${c+1}: ความหนาแน่น ${density}"></span>`;
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
      .select("id,match_id,actor,turn_number,event_type,occurred_at,move_score,equation,decision_time_ms,decision_quality,tactical_loss,move_value,best_move_value,gap_before,gap_after,rack_before,rack_after,board_state,threat_before,suggested_mode,raw")
      .eq("match_id",row.match_id)
      .order("id",{ascending:true})
      .limit(500);
    if (requestId !== selectedTelemetryRequest) return;
    if (error) { console.warn(error); return; }
    const sameMatch = selectedTurns.filter(t => t.match_id === row.match_id);
    selectedTurns = sameMatch;
    (data || []).forEach(mergeSelectedTurn);
    applyTurnDerivedState(row, selectedTurns);
    renderLiveList();
    renderLiveDetail(row);
    renderTelemetryPanels();
  }

  function renderRecentMoves() {
    const moves = selectedTurns.slice(showAllPitMoves ? 0 : -5).reverse();
    $("pit-recent-moves").innerHTML = moves.length ? moves.map((t,index) => {
      const dq = t.decision_quality == null ? "—" : Math.round(Number(t.decision_quality));
      const lossValue = t.raw?.tacticalLossPctV2 ?? t.tactical_loss;
      const loss = lossValue == null ? "—" : Number(lossValue).toFixed(1)+"%";
      const time = t.occurred_at ? new Date(t.occurred_at).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}) : "—";
      const rack = Array.isArray(t.rack_after) ? `${t.rack_after.length} tiles` : "—";
      const rackQuality = t.raw?.rackQualityAfter ?? t.raw?.rackQuality ?? t.raw?.rack_quality;
      return `<div class="spectator-move-row ${isCriticalTurn(t) ? "critical" : ""}">
        <span>${selectedTurns.length - index}</span>
        <span>${t.turn_number ?? "—"}</span>
        <span>${time}</span>
        <strong class="${t.actor === "player" ? "actor-player" : "actor-bot"}">${t.equation || t.event_type || "move"}</strong>
        <span class="move-score">${Number(t.move_score)>0?"+":""}${t.move_score ?? 0}</span>
        <span>${dq}</span><span>${loss}</span><span title="${rack}">${rackQuality == null ? "—" : pct(rackQuality)}</span>
      </div>`;
    }).join("") : '<p class="empty">ยังไม่มีการเดิน</p>';
  }

  function chartBase(type,labels,datasets,opts={}) {
    return {
      type,
      data:{labels,datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        animation:false,
        plugins:{
          legend:{
            display:!!opts.legend,
            position:"top",
            labels:{boxWidth:8,color:"#9ec7eb",font:{size:9}}
          }
        },
        scales: opts.noScales ? undefined : {
          x:{
            grid:{color:"#123653",display:true},
            border:{color:"#245274"},
            ticks:{color:"#7fa8ca",font:{size:8},maxTicksLimit:6}
          },
          y:{
            beginAtZero:opts.beginAtZero !== false,
            grid:{color:"#123653"},
            border:{color:"#245274"},
            ticks:{color:"#7fa8ca",font:{size:8},maxTicksLimit:5}
          }
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
      {label:"นักเรียน",data:pScores,borderColor:"#12b7ff",backgroundColor:"#12b7ff22",tension:.28,pointRadius:1.8,borderWidth:2},
      {label:"บอท",data:bScores,borderColor:"#ff3f88",backgroundColor:"#ff3f8822",tension:.28,pointRadius:1.8,borderWidth:2}
    ],{legend:true}));

    pitCharts.dq = new Chart($("pit-dq-chart"),chartBase("bar",player.map(t=>t.turn_number),[
      {data:player.map(t=>t.decision_quality),backgroundColor:player.map(t => Number(t.decision_quality)>=70 ? "#12b7ff" : Number(t.decision_quality)>=50 ? "#f5c84c" : "#ff4f78"),borderRadius:4}
    ]));

    pitCharts.time = new Chart($("pit-time-chart"),chartBase("bar",player.map(t=>t.turn_number),[
      {data:player.map(t=>t.decision_time_ms == null ? null : Number((t.decision_time_ms/1000).toFixed(1))),backgroundColor:"#ad5bdf",borderRadius:2}
    ]));

    pitCharts.loss = new Chart($("pit-loss-chart"),chartBase("bar",player.map(t=>t.turn_number),[
      {data:player.map(t=>t.raw?.tacticalLossPctV2 ?? t.tactical_loss),backgroundColor:"#ff4e78",borderRadius:2}
    ]));

    const avgDQ = average(player.map(t=>t.decision_quality)) ?? 0;
    const avgScore = average(player.map(t=>t.move_score)) ?? 0;
    const avgTime = average(player.map(t=>t.decision_time_ms));
    const avgLoss = average(player.map(t=>t.raw?.tacticalLossPctV2 ?? t.tactical_loss)) ?? 0;
    $("pit-dq-average").textContent = player.some(t=>t.decision_quality != null) ? `${Math.round(avgDQ)}% AVG` : "—";
    $("pit-time-average").textContent = avgTime == null ? "—" : `${(avgTime/1000).toFixed(1)}s AVG`;
    $("pit-loss-average").textContent = player.some(t=>(t.raw?.tacticalLossPctV2 ?? t.tactical_loss) != null) ? `${avgLoss.toFixed(1)}% AVG` : "—";
    const profile = [
      Math.max(0,Math.min(100,avgDQ)),
      Math.max(0,Math.min(100,avgScore/20*100)),
      avgTime == null ? 0 : Math.max(0,Math.min(100,100-(avgTime/60000*100))),
      Math.max(0,Math.min(100,Number(row.rack_quality)||0)),
      Math.max(0,Math.min(100,100-avgLoss))
    ];
    pitCharts.profile = new Chart($("pit-profile-chart"),{
      type:"radar",
      data:{labels:["DQ","Scoring","Speed","Rack","Control"],datasets:[{data:profile,borderColor:"#18b7ff",backgroundColor:"#18b7ff26",pointRadius:2,borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false}},scales:{r:{beginAtZero:true,max:100,grid:{color:"#21445e"},angleLines:{color:"#21445e"},ticks:{display:false},pointLabels:{color:"#9ec4df",font:{size:8}}}}}
    });

    const peers = liveRows.filter(x => x.student_user_id !== row.student_user_id && (!row.class_name || x.class_name === row.class_name));
    const peerScore = average(peers.map(x=>x.player_score)) ?? 0;
    const peerDQ = average(peers.map(x=>x.decision_quality)) ?? 0;
    const peerRack = average(peers.map(x=>x.rack_quality)) ?? 0;
    pitCharts.benchmark = new Chart($("pit-benchmark-chart"),chartBase("bar",["คะแนน","DQ","Rack"],[
      {label:row.student_code || "ผู้เล่น",data:[row.player_score||0,row.decision_quality||avgDQ,row.rack_quality||0],backgroundColor:"#12b7ff",borderRadius:4},
      {label:"ค่าเฉลี่ยกลุ่ม",data:[peerScore,peerDQ,peerRack],backgroundColor:"#6686a1",borderRadius:4}
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

  function dateLabel(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("th-TH",{day:"2-digit",month:"short"});
  }

  async function openStudentDeepAnalysis(studentId) {
    const liveRow = liveRows.find(r => r.student_user_id === studentId);
    const student = students.find(s => s.user_id === studentId) || (liveRow ? {
      user_id: studentId, full_name: liveRow.student_name, student_code: liveRow.student_code,
      class_name: liveRow.class_name, room_no: liveRow.room_no, active: true,
    } : null);
    if (!student) return;
    const requestId = ++deepAnalysisRequest;
    setView("student-detail");
    $("student-detail-name").textContent = student.full_name || student.student_code;
    $("deep-student-code").textContent = student.student_code || "—";
    $("student-detail-meta").textContent = `${student.class_name || "—"} | ห้องเรียน ${student.room_no || "—"}`;
    AMATH_DEEP_ANALYSIS.begin();
    $("deep-profile-meta").replaceChildren();
    $("student-kpis").innerHTML = '<div class="analysis-loading">กำลังโหลดข้อมูล...</div>';
    const studentMatches = matches.filter(m => m.student_user_id === studentId)
      .sort((a,b) => new Date(a.started_at) - new Date(b.started_at));
    const peers = student.class_name ? students.filter(s => s.user_id !== studentId &&
      s.class_name === student.class_name && String(s.room_no || "") === String(student.room_no || "")) : [];
    const peerIds = peers.map(s => s.user_id);
    const columns = "id,match_id,actor,turn_number,event_type,occurred_at,move_score,equation,decision_time_ms,decision_quality,tactical_loss,move_value,best_move_value,gap_before,gap_after,suggested_mode,threat_before,raw";
    const results = await Promise.all([
      sb().from("turn_events").select(columns).eq("student_user_id",studentId).order("occurred_at",{ascending:false}).limit(2000),
      peerIds.length ? sb().from("turn_events").select("match_id,actor,turn_number,event_type,occurred_at,move_score,decision_time_ms,decision_quality,tactical_loss,threat_before,raw")
        .in("student_user_id",peerIds).order("occurred_at",{ascending:false}).limit(2000) : Promise.resolve({data:[],error:null}),
    ]);
    if (requestId !== deepAnalysisRequest) return;
    const [{data:turns,error},{data:peerTurns,error:peerError}] = results;
    if (error) {
      console.warn(error);
      $("student-kpis").innerHTML = '<div class="analysis-loading">โหลด Turn Telemetry ไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง</div>';
      $("deep-refresh").onclick = () => openStudentDeepAnalysis(studentId);
      return;
    }
    $("deep-refresh").onclick = null;
    if (peerError) console.warn("[Deep Analysis] Class telemetry unavailable",peerError);
    AMATH_DEEP_ANALYSIS.render({student,studentMatches,turns:(turns || []).reverse(),peerTurns:(peerTurns || []).reverse(),
      peerMatches:matches.filter(m => peerIds.includes(m.student_user_id)),peerLiveRows:liveRows.filter(r=>peerIds.includes(r.student_user_id)),liveRow,studentCount:students.length,
      onReplay:(matchId,turnId) => openMatchReplay(matchId,studentId,{turnId}),
      onReload:async() => {await refreshStudents();await openStudentDeepAnalysis(studentId);},
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
    $("live-class-filter").addEventListener("change",renderLiveList);
    $("live-status-filter").addEventListener("change",renderLiveList);
    $("live-sort").addEventListener("change",renderLiveList);
    $("pit-show-all-moves").addEventListener("click",()=>{
      showAllPitMoves = !showAllPitMoves;
      $("pit-show-all-moves").textContent = showAllPitMoves ? "ย่อลง ↑" : "ดูทั้งหมด →";
      $("pit-show-all-moves").setAttribute("aria-pressed",String(showAllPitMoves));
      $("pit-recent-moves").classList.toggle("all-moves",showAllPitMoves);
      renderRecentMoves();
    });
    $("student-search").addEventListener("input",renderStudents);
    const tickPitClock = () => {
      const now = new Date();
      const el = $("pitwall-clock");
      if (el) el.textContent = now.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
      const dateEl = $("pitwall-date-label");
      if (dateEl) dateEl.textContent = now.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"});
    };
    tickPitClock();
    setInterval(tickPitClock,1000);
    setInterval(tickSpectatorClocks,500);
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
