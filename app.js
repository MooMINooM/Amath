/* A-Math Game — เกมจริง เล่นกับบอท (UI + game loop) */
(() => {
  const D = AMATH_DATA;
  const E = AMATH_ENGINE;
  const BOT = AMATH_GAME_BOT;

  const BONUS_LABEL = { TE: "3×", DE: "2×", TP: "3×", DP: "2×" };

  let board, bag, playerRack, botRack, playerScore, botScore;
  let isFirstMove, currentTurn, pendingCoords, nonScoringAfterBagEmpty, gameOver, difficulty;
  let clock = null, clockInterval = null, botTimeout = null;
  let selectedRackIndex = null;
  let turnNumber = 0;
  let showAmats = true;
  let turnStartRack = [];
  let turnStartBoard = null;
  let turnHistory = [];
  let opponentProfile = null; // V3: โปรไฟล์ผู้เล่น (จาก V2) ที่บอทใช้ปรับน้ำหนักการตัดสินใจของตัวเอง
  let lastPrimaryMode = null; // V6: ใช้เช็คว่าโหมดที่ AMATS แนะนำเปลี่ยนจากตาก่อนไหม เพื่อเน้นให้เห็นว่ามันวิเคราะห์ใหม่สดๆ จริง
  let csCurrentScenario = null, csCorrect = 0, csTotal = 0; // V6: สถานีฝึกคิด (Coach Station)

  const RACK_TONE = { Excellent: "good", Good: "good", Stable: "accent", Weak: "warn", Critical: "bad" };
  const BOARD_TONE = { Open: "good", Balanced: "accent", Controlled: "accent", Restricted: "warn", Dangerous: "bad" };
  const THREAT_TONE = { Low: "good", Medium: "accent", High: "warn", Critical: "bad" };

  function cloneBoardDeep(b) { return b.map(row => row.map(cell => (cell ? { ...cell } : null))); }

  function sizeBoard() {
    const wrap = document.getElementById("board-wrap");
    const boardEl = document.getElementById("board");
    if (!wrap || !boardEl) return;
    const size = Math.max(220, Math.min(wrap.clientWidth - 24, wrap.clientHeight - 24, 720));
    boardEl.style.width = size + "px";
    boardEl.style.height = size + "px";
    const shell = wrap.querySelector(".board-shell");
    if (shell) shell.style.width = size + 24 + "px";
  }
  window.addEventListener("resize", sizeBoard);

  function newBoard() { return Array.from({ length: D.BOARD_SIZE }, () => Array(D.BOARD_SIZE).fill(null)); }

  function drawFromBag(rack, count) {
    let drawn = 0;
    while (drawn < count && rack.length < D.RACK_SIZE && bag.length > 0) {
      rack.push(bag.pop());
      drawn++;
    }
  }

  function startGame(diff) {
    stopTimers();
    difficulty = diff;
    const rulesetId = document.getElementById("ruleset-select")?.value || "STANDARD_100";
    D.setRuleset(rulesetId);
    clock = AMATH_CLOCK.create(D.CLOCK_MINUTES);
    board = newBoard();
    bag = D.buildBag();
    playerRack = []; botRack = [];
    drawFromBag(playerRack, D.RACK_SIZE);
    drawFromBag(botRack, D.RACK_SIZE);
    playerScore = 0; botScore = 0;
    isFirstMove = true; currentTurn = "player"; pendingCoords = [];
    nonScoringAfterBagEmpty = { player: 0, bot: 0 }; gameOver = false; selectedRackIndex = null; turnNumber = 0;
    turnHistory = [];
    lastPrimaryMode = null;
    const profile = typeof AMATS_PROFILE !== "undefined" ? AMATS_PROFILE.computeProfile() : null;
    opponentProfile = profile && !profile.insufficient ? profile : null;
    turnStartRack = playerRack.slice();
    turnStartBoard = cloneBoardDeep(board);
    clearLog();
    log(`เริ่มเกมใหม่ — ${D.RULESET_LABEL} · บอทระดับ ${diff}`);
    document.getElementById("header-ruleset").textContent = D.RULESET_LABEL;
    document.getElementById("bag-total").textContent = D.TOTAL_TILES;
    document.getElementById("bot-difficulty").textContent = { Rookie: "เริ่มต้น", Standard: "ปกติ", Master: "เชี่ยวชาญ" }[diff] || diff;
    document.getElementById("setup-panel").hidden = true;
    document.getElementById("game-layout").hidden = false;
    document.getElementById("bottom-bar").hidden = false;
    document.getElementById("topbar-status").hidden = false;
    document.getElementById("summary-overlay").hidden = true;
    AMATS_LOGGER.startMatch({
      opponentType: "bot",
      difficulty: diff,
      rulesetId: D.RULESET_ID,
      rulesetLabel: D.RULESET_LABEL,
    });
    renderAll();
    requestAnimationFrame(sizeBoard);
    clock.switchTo("player");
    clockInterval = setInterval(checkClock, 200);
    renderClock();
  }

  function stopTimers() {
    clearInterval(clockInterval);
    clearTimeout(botTimeout);
    if (clock) clock.pause();
  }

  function renderClock(state = clock?.snapshot()) {
    if (!state) return;
    for (const side of ["player", "bot"]) {
      const el = document.getElementById(`clock-${side}`);
      el.textContent = AMATH_CLOCK.format(state.remainingMs[side]);
      el.classList.toggle("clock-active", state.active === side);
      el.classList.toggle("clock-overtime", state.remainingMs[side] < 0);
      document.getElementById(`penalty-${side}`).textContent = state.penalties[side] ? `หักเวลา ${state.penalties[side]} คะแนน` : "";
      const fill = document.getElementById(`clock-fill-${side}`);
      if (fill?.style) fill.style.width = `${Math.min(100, Math.max(0, state.remainingMs[side] / (D.CLOCK_MINUTES * 60000) * 100))}%`;
    }
  }

  function checkClock() {
    if (gameOver || !clock) return gameOver;
    const state = clock.snapshot();
    renderClock(state);
    if (!state.bothExpired && state.expired.length === 0) return false;
    // Unsubmitted tiles still belong to the player rack for final deductions.
    recallAll();
    endGame("แพ้เวลา — ใช้เวลาเกินกำหนด 5 นาที");
    return true;
  }

  function acceptAction(side) {
    if (gameOver || currentTurn !== side || checkClock()) return false;
    clock.pause();
    return true;
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    renderBoard();
    renderRack();
    renderStatus();
    renderActions();
    renderAmatsPanel();
    renderScorePanel();
    renderHistoryTable();
    renderClock();
  }

  function situationStat(label, levelText, pct, tone) {
    return `
      <div class="situ-stat" title="${levelText}">
        <div class="situ-label">${label}</div>
        <div class="situ-pct">${pct}%</div>
        <div class="meter"><div class="meter-fill ${tone}" style="width:${pct}%"></div></div>
      </div>`;
  }

  function renderAmatsPanel() {
    const bubble = document.getElementById("advice-text");
    bubble.replaceChildren();
    if (!showAmats || !AMATS_BRIDGE.available) {
      bubble.textContent = showAmats ? "ไม่สามารถโหลด AMATS ได้" : "มองหาสมการที่ใช้ช่อง 2× หรือ 3× และระวังช่องที่เปิดให้คู่แข่ง";
      return;
    }
    const analysis = AMATS_BRIDGE.analyze({
      board, myScore: playerScore, oppScore: botScore, turnNumber: turnNumber + 1, rack: playerRack, opponentDifficulty: difficulty,
    });
    const mode = analysis.recommendation?.primary;
    const tips = {
      PRESS: "เร่งทำคะแนนจากช่องโบนัสที่คุ้มค่า",
      BUILD: "วางเบี้ยเพื่อเตรียมทางทำคะแนนตาถัดไป",
      CONTROL: "เก็บแต้มพร้อมรักษาทางเลือกในมือ",
      DENY: "ปิดช่องโบนัสที่คู่แข่งอาจใช้ทำคะแนน",
      GUARD: "รักษาคะแนนนำและเลี่ยงเปิดช่องใหญ่",
      RESET: "ปรับคุณภาพเบี้ยในมือก่อนเดินต่อ",
    };
    const heading = document.createElement("strong");
    heading.textContent = `AMATS · ${mode || "กำลังประเมิน"}`;
    const tip = document.createElement("span");
    tip.className = "advice-tip";
    tip.textContent = tips[mode] || "พิจารณาสถานการณ์บนกระดานก่อนเดิน";
    const context = document.createElement("small");
    context.textContent = `คะแนน${analysis.gap} · โอกาสชนะประมาณ ${analysis.winProb ?? "–"}%`;
    bubble.append(heading, tip, context);
  }

  function renderScorePanel() {
    const spPlayer = document.getElementById("sp-player-score");
    if (!spPlayer) return;
    document.getElementById("sp-bot-score").textContent = botScore;
    spPlayer.textContent = playerScore;
    const gap = playerScore - botScore;
    const gapEl = document.getElementById("gap-badge");
    gapEl.textContent = `Gap ${gap > 0 ? "+" : ""}${gap}`;
    gapEl.className = "gap-badge " + (gap > 0 ? "positive" : gap < 0 ? "negative" : "neutral");
    document.getElementById("bag-meter-text").textContent = `${bag.length}/${D.TOTAL_TILES}`;
    document.getElementById("bag-meter-fill").style.width = Math.round((bag.length / D.TOTAL_TILES) * 100) + "%";
    const estTotal = AMATS_BRIDGE.totalTurns || 20;
    document.getElementById("turn-progress-text").textContent = `${turnNumber + 1}/${estTotal}`;
    document.getElementById("diff-progress-text").textContent = difficulty || "-";
    document.getElementById("sp-player-score-detail").textContent = playerScore;
    const rackPct = AMATS_BRIDGE.available ? AMATS_BRIDGE.rackHealth(playerRack).pct : 0;
    document.getElementById("rack-power-fill").style.width = rackPct + "%";
    document.getElementById("rack-power-text").textContent = rackPct + "%";
  }

  function pushHistory(entry) {
    turnHistory.unshift({ ...entry, time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) });
    renderHistoryTable();
  }

  function renderHistoryTable() {
    const el = document.getElementById("history-table");
    if (!el) return;
    if (turnHistory.length === 0) { el.innerHTML = `<p class="empty-history">การเดินแต่ละตาจะปรากฏที่นี่</p>`; return; }
    el.innerHTML = turnHistory.slice(0, 20).map(h => `
      <div class="history-row ${h.actor}">
        <span class="history-number">${h.turnNumber}</span>
        <strong>${h.actor === "player" ? "นักเรียน" : "บอท"}</strong>
        <span class="history-eq">วาง ${h.equation}</span>
        <span class="history-score">+${h.score}</span>
        <time>${h.time}</time>
      </div>`).join("");
  }

  function renderBoard() {
    const el = document.getElementById("board");
    el.innerHTML = "";
    for (let r = 0; r < D.BOARD_SIZE; r++) {
      for (let c = 0; c < D.BOARD_SIZE; c++) {
        const cell = document.createElement("div");
        const bonus = D.bonusAt(r, c);
        const isCenter = D.isCenter(r, c);
        cell.className = "cell " + (bonus ? bonus.toLowerCase() : "plain");
        const tile = board[r][c];
        if (tile) {
          cell.classList.add("has-tile");
          if (!tile.locked) cell.classList.add("pending");
          cell.innerHTML = `<div class="tile ${tile.locked ? "locked" : "pending-tile"}">
            <span class="tile-char">${tile.resolvedChar}</span><span class="tile-pts">${tile.points}</span></div>`;
          if (!tile.locked && currentTurn === "player") {
            cell.addEventListener("click", () => returnPendingTile(r, c));
          }
        } else {
          if (isCenter) cell.innerHTML = `<span class="star">★</span>`;
          else if (bonus) cell.innerHTML = `<span class="bonus-label">${BONUS_LABEL[bonus]}</span>`;
          if (currentTurn === "player" && !gameOver) {
            cell.addEventListener("click", () => placeSelectedAt(r, c));
          }
        }
        el.appendChild(cell);
      }
    }
  }

  function renderRack() {
    const el = document.getElementById("player-rack");
    el.innerHTML = "";
    document.getElementById("rack-count-text").textContent = `${playerRack.length}`;
    playerRack.forEach((tile, i) => {
      const slot = document.createElement("div");
      slot.className = "rack-tile" + (i === selectedRackIndex ? " selected" : "");
      slot.innerHTML = `<span class="tile-char">${tile.kind === "blank" ? "?" : tile.face}</span><span class="tile-pts">${tile.points}</span>`;
      slot.addEventListener("click", () => selectRackTile(i));
      el.appendChild(slot);
    });
    for (let i = playerRack.length; i < D.RACK_SIZE; i++) {
      const empty = document.createElement("div");
      empty.className = "rack-slot empty";
      empty.setAttribute("aria-hidden", "true");
      el.appendChild(empty);
    }
    document.getElementById("bot-rack-count").textContent = botRack.length;
    const botEl = document.getElementById("bot-rack");
    botEl.innerHTML = "";
    for (let i = 0; i < botRack.length; i++) {
      const slot = document.createElement("div");
      slot.className = "rack-tile face-down";
      slot.textContent = "?";
      botEl.appendChild(slot);
    }
  }

  function renderStatus() {
    document.getElementById("bot-score").textContent = botScore;
    document.getElementById("bag-count").textContent = bag.length;
    document.getElementById("turn-indicator").textContent = gameOver ? "จบเกมแล้ว" : "กำลังเล่น";
    const active = currentTurn === "player" && !gameOver;
    document.getElementById("human-turn-status").textContent = gameOver ? "จบเกมแล้ว" : active ? "▶ ตาของคุณ" : "● รอบอทเดิน";
    document.getElementById("player-card").classList.toggle("active-turn", active);
    document.getElementById("bottom-rack").classList.toggle("active-turn", currentTurn === "player" && !gameOver);
    document.getElementById("bot-strip").classList.toggle("active-turn", currentTurn === "bot" && !gameOver);
  }

  function renderActions() {
    const disabled = currentTurn !== "player" || gameOver;
    ["btn-submit","btn-recall","btn-shuffle","btn-exchange","btn-pass"].forEach(id => {
      document.getElementById(id).disabled = disabled;
    });
    document.getElementById("btn-exchange").disabled = disabled || bag.length < 5 || playerRack.length === 0;
  }

  /* ---------- Interaction (tap-to-select, tap-to-place) ---------- */
  function selectRackTile(i) {
    if (currentTurn !== "player" || gameOver) return;
    selectedRackIndex = selectedRackIndex === i ? null : i;
    renderRack();
  }

  function placeSelectedAt(r, c) {
    if (selectedRackIndex === null || currentTurn !== "player" || gameOver) return;
    const tile = playerRack[selectedRackIndex];
    const finish = (resolvedChar) => {
      if (gameOver || currentTurn !== "player" || checkClock()) return;
      board[r][c] = { points: tile.points, resolvedChar, isNew: true, locked: false, kind: tile.kind, face: tile.face, id: tile.id };
      playerRack.splice(selectedRackIndex, 1);
      pendingCoords.push({ r, c });
      selectedRackIndex = null;
      renderAll();
    };
    if (tile.choices) openWildcardPicker(tile, finish);
    else finish(tile.kind === "number" ? String(tile.face) : tile.face);
  }

  function returnPendingTile(r, c) {
    if (currentTurn !== "player" || gameOver) return;
    const tile = board[r][c];
    if (!tile || tile.locked) return;
    playerRack.push({ id: tile.id, kind: tile.kind, face: tile.face, points: tile.points, choices: D.OPERATOR_TILES[tile.face]?.choices || (tile.kind === "blank" ? D.BLANK_TILE.choices : null) });
    board[r][c] = null;
    pendingCoords = pendingCoords.filter(p => !(p.r === r && p.c === c));
    renderAll();
  }

  function recallAll() {
    pendingCoords.slice().forEach(({ r, c }) => returnPendingTile(r, c));
  }

  function shuffleRackOrder() {
    for (let i = playerRack.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerRack[i], playerRack[j]] = [playerRack[j], playerRack[i]];
    }
    renderRack();
  }

  /* ---------- Wildcard picker ---------- */
  function openWildcardPicker(tile, onResolve) {
    const modal = document.getElementById("modal");
    const isBlank = tile.kind === "blank";
    modal.innerHTML = `
      <div class="modal-box">
        <h3>${isBlank ? "เบี้ยว่าง (BLANK) นี้ใช้แทนอะไร?" : `เบี้ย "${tile.face}" นี้ใช้เป็นเครื่องหมายอะไร?`}</h3>
        <p class="muted">เลือกแล้วจะเปลี่ยนไม่ได้ตลอดเกม (ตามกติกา A-Math)</p>
        <div class="choice-grid">
          ${tile.choices.map(ch => `<button class="choice-btn" data-ch="${ch}">${ch}</button>`).join("")}
        </div>
      </div>`;
    modal.hidden = false;
    modal.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", () => { modal.hidden = true; onResolve(btn.dataset.ch); });
    });
  }

  /* ---------- Exchange ---------- */
  function openExchangeModal() {
    if (gameOver || currentTurn !== "player" || checkClock()) return;
    if (bag.length < 5) { showToast("เบี้ยในถุงเหลือไม่ถึง 5 ใบ แลกไม่ได้", "error"); return; }
    const modal = document.getElementById("modal");
    const chosen = new Set();
    modal.innerHTML = `
      <div class="modal-box">
        <h3>เลือกเบี้ยที่จะแลก (1-8 ใบ)</h3>
        <div class="choice-grid" id="exchange-grid">
          ${playerRack.map((t, i) => `<button class="choice-btn" data-i="${i}">${t.kind === "blank" ? "?" : t.face}</button>`).join("")}
        </div>
        <div class="row-actions">
          <button id="exchange-confirm" class="btn-primary">แลกเบี้ยที่เลือก</button>
          <button id="exchange-cancel" class="btn-secondary">ยกเลิก</button>
        </div>
      </div>`;
    modal.hidden = false;
    modal.querySelectorAll(".choice-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = +btn.dataset.i;
        if (chosen.has(i)) { chosen.delete(i); btn.classList.remove("selected"); }
        else { chosen.add(i); btn.classList.add("selected"); }
      });
    });
    document.getElementById("exchange-cancel").addEventListener("click", () => { modal.hidden = true; });
    document.getElementById("exchange-confirm").addEventListener("click", () => {
      modal.hidden = true;
      if (chosen.size === 0) return;
      doExchange([...chosen]);
    });
  }

  function doExchange(indices) {
    if (!acceptAction("player")) return;
    const returned = indices.map(i => playerRack[i]);
    playerRack = playerRack.filter((_, i) => !indices.includes(i));
    bag.push(...returned);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    drawFromBag(playerRack, returned.length);
    log(`คุณแลกเบี้ย ${returned.length} ใบ`);
    recordNonScoringTurn("player");
    endTurn();
  }

  /* ---------- Submit / Pass ---------- */
  function submitMove() {
    if (gameOver || currentTurn !== "player" || checkClock()) return;
    if (pendingCoords.length === 0) { showToast("ยังไม่ได้วางเบี้ย", "error"); return; }
    const result = E.validateAndScoreMove(board, pendingCoords, isFirstMove);
    if (!result.valid) { showToast(result.error, "error"); return; }

    if (!acceptAction("player")) return;
    const candidateForLog = {
      coords: pendingCoords.slice(),
      tiles: pendingCoords.map(({ r, c }) => board[r][c]),
      score: result.score,
    };
    const wasFirstMove = isFirstMove;
    const playerScoreBefore = playerScore;
    const botScoreBefore = botScore;

    pendingCoords.forEach(({ r, c }) => { board[r][c].locked = true; board[r][c].isNew = false; });
    playerScore += result.score;
    isFirstMove = false;
    resetNonScoringSequence();
    turnNumber++;
    result.equations.forEach(eq => log(`คุณเล่น "${eq.string}" ได้ ${eq.score} คะแนน`));
    if (result.bingo) { log("BINGO! +40 คะแนนพิเศษ"); showToast("BINGO! +40 คะแนน", "success"); }
    pushHistory({ turnNumber, actor: "player", score: result.score, equation: result.equations.map(e => e.string).join(" & ") });
    drawFromBag(playerRack, pendingCoords.length);
    pendingCoords = [];

    AMATS_LOGGER.logPlayerTurn({
      board: turnStartBoard, rackBefore: turnStartRack, playerScoreBefore, botScoreBefore,
      turnNumber, isFirstMove: wasFirstMove, candidate: candidateForLog, moveResult: result, opponentDifficulty: difficulty,
    });

    if (checkImmediateEndgame("player")) return;
    endTurn();
  }

  function passTurn() {
    if (!acceptAction("player")) return;
    recallAll();
    log("คุณผ่านตา");
    recordNonScoringTurn("player");
    endTurn();
  }

  function endTurn() {
    renderAll();
    if (checkStuckEndgame()) return;
    currentTurn = currentTurn === "player" ? "bot" : "player";
    if (currentTurn === "player") {
      turnStartRack = playerRack.slice();
      turnStartBoard = cloneBoardDeep(board);
      AMATS_LOGGER.markTurnStart();
    }
    renderAll();
    clock.switchTo(currentTurn);
    renderClock();
    if (currentTurn === "bot" && !gameOver) botTimeout = setTimeout(botTakeTurn, 700);
  }

  /* ---------- Bot turn ---------- */
  function botTakeTurn() {
    if (gameOver || currentTurn !== "bot" || checkClock()) return;
    const move = BOT.findMove(board, botRack, isFirstMove, difficulty, {
      myScore: botScore, oppScore: playerScore, turnNumber: turnNumber + 1, opponentProfile,
    });
    if (!acceptAction("bot")) return;
    if (move.found) {
      move.coords.forEach(({ r, c }, i) => {
        const tile = move.tiles[i];
        board[r][c] = { points: tile.points, resolvedChar: tile.resolvedChar, isNew: false, locked: true, kind: tile.kind, face: tile.face, id: tile.id };
        botRack = botRack.filter(t => t.id !== tile.id);
      });
      botScore += move.score;
      isFirstMove = false;
      resetNonScoringSequence();
      turnNumber++;
      move.equations.forEach(eq => log(`บอทเล่น "${eq.string}" ได้ ${eq.score} คะแนน`));
      if (move.coords.length === D.RACK_SIZE) log("บอททำ BINGO! +40 คะแนน");
      pushHistory({ turnNumber, actor: "bot", score: move.score, equation: move.equations.map(e => e.string).join(" & ") });
      drawFromBag(botRack, move.coords.length);
      AMATS_LOGGER.logBotTurn(turnNumber, move.score);
      if (checkImmediateEndgame("bot")) return;
    } else {
      if (bag.length >= 5 && botRack.length > 0) {
        const n = Math.min(botRack.length, 1 + Math.floor(Math.random() * botRack.length));
        const returned = botRack.splice(0, n);
        bag.push(...returned);
        for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
        drawFromBag(botRack, n);
        log(`บอทแลกเบี้ย ${n} ใบ`);
        recordNonScoringTurn("bot");
      } else {
        log("บอทผ่านตา (ไม่พบทางเดินที่ถูกกติกา และแลกเบี้ยไม่ได้)");
        recordNonScoringTurn("bot");
      }
      AMATS_LOGGER.logBotTurn(turnNumber, 0);
    }
    endTurn();
  }

  /* ---------- Endgame ---------- */
  function tilePointSum(rack) { return rack.reduce((s, t) => s + (t.kind === "blank" ? 0 : t.points), 0); }

  function checkImmediateEndgame(who) {
    if (bag.length > 0) return false;
    const rack = who === "player" ? playerRack : botRack;
    if (rack.length > 0) return false;
    const other = who === "player" ? botRack : playerRack;
    const bonus = 2 * tilePointSum(other);
    if (who === "player") playerScore += bonus; else botScore += bonus;
    endGame(`${who === "player" ? "คุณ" : "บอท"}ใช้เบี้ยหมดก่อน ได้คะแนนเบี้ยที่เหลือของอีกฝ่าย ×2 เพิ่ม ${bonus} คะแนน`);
    return true;
  }

  function resetNonScoringSequence() {
    nonScoringAfterBagEmpty = { player: 0, bot: 0 };
  }

  function recordNonScoringTurn(actor) {
    // กติกาแข่งขัน 2569 ใช้เงื่อนไขนี้หลังเบี้ยหมดถุงเท่านั้น:
    // แต่ละฝ่ายไม่ทำคะแนน 3 ครั้งติดต่อกัน รวม 6 ครั้ง
    if (bag.length > 0) {
      resetNonScoringSequence();
      return;
    }
    nonScoringAfterBagEmpty[actor]++;
  }

  function checkStuckEndgame() {
    if (
      bag.length === 0 &&
      nonScoringAfterBagEmpty.player >= 3 &&
      nonScoringAfterBagEmpty.bot >= 3
    ) {
      playerScore -= tilePointSum(playerRack);
      botScore -= tilePointSum(botRack);
      endGame("เบี้ยหมดถุงและทั้งสองฝ่ายไม่ทำคะแนนฝ่ายละ 3 ครั้งติดต่อกัน — หักคะแนนเบี้ยที่เหลือในมือของแต่ละฝ่าย");
      return true;
    }
    return false;
  }

  function endGame(reason) {
    if (gameOver) return;
    stopTimers();
    const clockState = clock.snapshot();
    const ruling = AMATH_CLOCK.adjudicate(
      { player: playerScore, bot: botScore },
      { player: tilePointSum(playerRack), bot: tilePointSum(botRack) }, clockState);
    playerScore = ruling.scores.player;
    botScore = ruling.scores.bot;
    gameOver = true;
    document.getElementById("modal").hidden = true;
    log(`หักเวลา: คุณ ${clockState.penalties.player} · บอท ${clockState.penalties.bot} คะแนน`);
    renderAll();
    const winner = ruling.bothLost ? "แพ้เวลาทั้งสองฝ่าย" : ruling.loser === "player" ? "บอทชนะ (เวลา)" : ruling.loser === "bot" ? "คุณชนะ! (เวลา)" : playerScore > botScore ? "คุณชนะ!" : playerScore < botScore ? "บอทชนะ" : "เสมอกัน";
    const result = ruling.bothLost ? "double_loss" : ruling.loser === "player" ? "loss" : ruling.loser === "bot" ? "win" : playerScore > botScore ? "win" : playerScore < botScore ? "loss" : "draw";
    log(`จบเกม — ${reason}`);
    log(`ผลสุดท้าย: คุณ ${playerScore} — บอท ${botScore} (${winner})`);
    showToast(`จบเกม: ${winner} (${playerScore} - ${botScore})`, "info");
    const finished = AMATS_LOGGER.finalizeMatch({ result, finalPlayerScore: playerScore, finalBotScore: botScore, clock: clockState, endReason: reason });
    renderSummary(finished, winner);
  }

  /* ---------- Post-game summary ---------- */
  function renderSummary(match, winnerLabel) {
    const overlay = document.getElementById("summary-overlay");
    const box = document.getElementById("summary-box");
    const s = match && match.summary;
    if (!s) {
      box.innerHTML = `<h2>จบเกม</h2><p class="result-line">${winnerLabel}: คุณ ${match ? match.finalPlayerScore : playerScore} — บอท ${match ? match.finalBotScore : botScore}</p>
        <p class="muted">ยังไม่มีข้อมูลตาที่พอวิเคราะห์ได้ (เล่นน้อยเกินไป)</p>
        <button id="summary-close" class="btn-primary">ปิด</button>`;
    } else {
      const decisionRow = (t, cls) => `
        <div class="decision-row ${cls}">
          <span class="eq">${t.equation || "-"}</span>
          <span class="muted">ตาที่ ${t.turnNumber}</span>
          <span class="dq-badge">DQ ${t.decisionQuality.toFixed(0)}%</span>
          <span class="muted">Loss ${t.tacticalLoss.toFixed(1)}</span>
        </div>`;
      const modeList = Object.entries(s.modeUsage).sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `<span class="amats-mode-badge" style="background:${AMATS_DATA.MODES[m].color}">${m} ×${n}</span>`).join(" ");
      box.innerHTML = `
        <h2>จบเกม — ${winnerLabel}</h2>
        <p class="result-line">คุณ ${match.finalPlayerScore} — บอท ${match.finalBotScore}</p>
        <div class="summary-kpis">
          <div class="summary-kpi"><div class="summary-kpi-label">Decision Quality เฉลี่ย</div><div class="summary-kpi-value">${s.avgDecisionQuality.toFixed(0)}%</div></div>
          <div class="summary-kpi"><div class="summary-kpi-label">Tactical Loss เฉลี่ย</div><div class="summary-kpi-value">${s.avgTacticalLoss.toFixed(1)}</div></div>
          <div class="summary-kpi"><div class="summary-kpi-label">คะแนนเฉลี่ย/ตา</div><div class="summary-kpi-value">${s.avgScore.toFixed(1)}</div></div>
          <div class="summary-kpi"><div class="summary-kpi-label">ตาที่ตัดสินใจดี (≥70%)</div><div class="summary-kpi-value">${s.goodDecisionRate.toFixed(0)}%</div></div>
        </div>
        <div class="summary-section-title">Best Decisions</div>
        ${s.bestDecisions.length ? s.bestDecisions.map(t => decisionRow(t, "best")).join("") : `<p class="muted">ยังไม่มีข้อมูล</p>`}
        <div class="summary-section-title">Decisions to Improve</div>
        ${s.worstDecisions.length ? s.worstDecisions.map(t => decisionRow(t, "worst")).join("") : `<p class="muted">ไม่มีตาที่เสียโอกาสมาก เล่นได้ดีมาก!</p>`}
        <div class="summary-section-title">Tactical Profile เบื้องต้น — สถานการณ์ที่เจอบ่อย</div>
        <p>${modeList || '<span class="muted">ไม่มีข้อมูล</span>'}</p>
        <button id="summary-close" class="btn-primary">ปิด</button>
      `;
    }
    overlay.hidden = false;
    document.getElementById("summary-close").addEventListener("click", () => { overlay.hidden = true; });
  }

  /* ---------- Player profile (V2: Statistical Player Model) ---------- */
  function renderProfileModal() {
    const modal = document.getElementById("modal");
    const profile = AMATS_PROFILE.computeProfile();
    if (profile.insufficient) {
      modal.innerHTML = `
        <div class="modal-box profile-box">
          <h3>โปรไฟล์นักเล่น</h3>
          <p class="muted">ข้อมูลยังไม่พอวิเคราะห์ (เล่นแล้ว ${profile.sampleSize} ตา ต้องการอย่างน้อย ${profile.minTurns} ตา) ลองเล่นอีกสักเกมแล้วกลับมาดูใหม่</p>
          <div class="row-actions"><button id="profile-close" class="btn-primary">ปิด</button></div>
        </div>`;
    } else {
      const ranked = Object.entries(profile.scores).sort((a, b) => b[1] - a[1]);
      modal.innerHTML = `
        <div class="modal-box profile-box">
          <h3>โปรไฟล์นักเล่น</h3>
          <p class="muted">จากการเล่น ${profile.matchesCount} เกม (${profile.sampleSize} ตา)</p>
          <div class="profile-primary">
            <div class="profile-primary-name">${profile.primary.name}</div>
            <p class="profile-primary-desc">${profile.primary.strength}</p>
            <p class="profile-primary-watch muted">ข้อควรระวัง: ${profile.primary.watch}</p>
          </div>
          <div class="profile-bars">
            ${ranked.map(([name, score]) => `
              <div class="profile-bar-row">
                <span class="profile-bar-label">${name}</span>
                <div class="meter"><div class="meter-fill accent" style="width:${score}%"></div></div>
                <span class="profile-bar-pct">${score}%</span>
              </div>`).join("")}
          </div>
          <div class="summary-kpis">
            <div class="summary-kpi"><div class="summary-kpi-label">อัตราชนะ</div><div class="summary-kpi-value">${profile.winRate === null ? "-" : Math.round(profile.winRate * 100) + "%"}</div></div>
            <div class="summary-kpi"><div class="summary-kpi-label">คะแนนเฉลี่ย/ตา</div><div class="summary-kpi-value">${profile.avgScore.toFixed(1)}</div></div>
            <div class="summary-kpi"><div class="summary-kpi-label">Decision Quality เฉลี่ย</div><div class="summary-kpi-value">${profile.avgDecisionQuality.toFixed(0)}%</div></div>
          </div>
          <div class="row-actions"><button id="profile-close" class="btn-primary">ปิด</button></div>
        </div>`;
    }
    modal.hidden = false;
    document.getElementById("profile-close").addEventListener("click", () => { modal.hidden = true; });
  }

  /* ---------- Coach Station (V6) — ฝึกเลือก Tactical Mode จาก PRACTICE_SCENARIOS ที่เขียนไว้ใน amats-data.js
   * (เดิมเป็นหน้า AMATS Trainer แยกต่างหากที่เคยถูกลบไปตอนรวมเป็นเกมเดียว เนื้อหาเดิมยังอยู่ครบแค่ไม่เคยถูกใช้เลย) */
  function renderCoachStation() {
    csCorrect = 0; csTotal = 0;
    const modal = document.getElementById("modal");
    modal.innerHTML = `
      <div class="modal-box coach-station-box">
        <h3>สถานีฝึกคิด AMATS</h3>
        <p class="muted">อ่านสถานการณ์ แล้วเลือกโหมดที่ควรใช้ ก่อนดูคำตอบจาก AMATS</p>
        <div class="cs-score">ตอบถูก <b id="cs-score">0</b>/<b id="cs-total">0</b></div>
        <div class="cs-scenario" id="cs-scenario"></div>
        <div class="amats-mode-grid" id="cs-mode-grid"></div>
        <div id="cs-result"></div>
        <div class="row-actions">
          <button id="cs-next" class="btn-secondary" hidden type="button">โจทย์ถัดไป</button>
          <button id="cs-close" class="btn-primary" type="button">ปิด</button>
        </div>
      </div>`;
    modal.hidden = false;
    document.getElementById("cs-close").addEventListener("click", () => { modal.hidden = true; });
    document.getElementById("cs-next").addEventListener("click", nextCsScenario);
    nextCsScenario();
  }

  function nextCsScenario() {
    const scenarios = AMATS_DATA.PRACTICE_SCENARIOS;
    csCurrentScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    document.getElementById("cs-scenario").innerHTML = `<p>${csCurrentScenario.story}</p>`;
    document.getElementById("cs-result").innerHTML = "";
    document.getElementById("cs-next").hidden = true;
    const modes = AMATS_DATA.MODES;
    const grid = document.getElementById("cs-mode-grid");
    grid.innerHTML = Object.keys(modes).map(key =>
      `<button class="mode-chip cs-mode-btn" style="--mc:${modes[key].color}" data-mode="${key}" type="button">${key}</button>`
    ).join("");
    grid.querySelectorAll(".cs-mode-btn").forEach(btn => btn.addEventListener("click", () => answerCsScenario(btn.dataset.mode)));
  }

  function answerCsScenario(chosenMode) {
    const s = csCurrentScenario;
    const rec = AMATS_ENGINE.recommendMode({ gap: s.gap, phase: s.phase, rack: s.rack, board: s.board, threat: s.threat });
    const correct = chosenMode === rec.primary;
    csTotal++;
    if (correct) csCorrect++;
    document.getElementById("cs-score").textContent = csCorrect;
    document.getElementById("cs-total").textContent = csTotal;
    document.getElementById("cs-result").innerHTML = `
      <div class="cs-result-box ${correct ? "positive" : "negative"}">
        <p>${correct ? "ตอบถูก!" : `ยังไม่ตรง — AMATS แนะนำ <b>${rec.primary}</b> (สำรอง ${rec.secondary})`}</p>
        <ul>${rec.reasons.map(r => `<li>${r}</li>`).join("")}</ul>
      </div>`;
    document.getElementById("cs-mode-grid").querySelectorAll(".cs-mode-btn").forEach(b => b.disabled = true);
    document.getElementById("cs-next").hidden = false;
  }

  /* ---------- Log & Toast ---------- */
  function log(msg) {
    const el = document.getElementById("log");
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = msg;
    el.prepend(line);
  }
  function clearLog() { document.getElementById("log").innerHTML = ""; }

  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".difficulty-btn").forEach(btn => {
      btn.addEventListener("click", () => startGame(btn.dataset.diff));
    });
    document.getElementById("btn-submit").addEventListener("click", submitMove);
    document.getElementById("btn-recall").addEventListener("click", () => { recallAll(); renderAll(); });
    document.getElementById("btn-shuffle").addEventListener("click", shuffleRackOrder);
    document.getElementById("btn-exchange").addEventListener("click", openExchangeModal);
    document.getElementById("btn-pass").addEventListener("click", passTurn);
    const setAnalysis = enabled => {
      showAmats = enabled;
      document.getElementById("amats-toggle").checked = enabled;
      renderAmatsPanel();
    };
    document.getElementById("amats-toggle").addEventListener("change", e => setAnalysis(e.target.checked));
    const setScoreTab = selected => {
      document.getElementById("history-table").hidden = selected;
      document.getElementById("scoreboard-view").hidden = !selected;
      document.getElementById("tab-history").classList.toggle("selected", !selected);
      document.getElementById("tab-score").classList.toggle("selected", selected);
    };
    document.getElementById("tab-history").addEventListener("click", () => setScoreTab(false));
    document.getElementById("tab-score").addEventListener("click", () => setScoreTab(true));
    const exitGame = () => {
      stopTimers(); gameOver = true;
      document.getElementById("modal").hidden = true;
      document.getElementById("game-layout").hidden = true;
      document.getElementById("bottom-bar").hidden = true;
      document.getElementById("topbar-status").hidden = true;
      document.getElementById("setup-panel").hidden = false;
    };
    document.getElementById("btn-restart").addEventListener("click", exitGame);
    document.getElementById("btn-restart-bottom").addEventListener("click", () => {
      if (window.confirm("เริ่มเกมใหม่ด้วยชุดกติกาเดิม? เกมปัจจุบันจะสิ้นสุด")) startGame(difficulty);
    });
    document.getElementById("btn-rules").addEventListener("click", () => {
      const modal = document.getElementById("modal");
      modal.innerHTML = `<div class="modal-box"><h3>วิธีเล่น A-Math</h3><p>เลือกเบี้ยในมือ แล้วเลือกช่องบนกระดานเพื่อสร้างสมการแนวนอนหรือแนวตั้ง ตาแรกต้องผ่านดาวกลางกระดาน สมการทุกแนวต้องถูกต้อง</p><p>ช่อง 2× / 3× ให้คะแนนพิเศษเฉพาะเมื่อวางเบี้ยทับครั้งแรก เวลาที่เกินกำหนดจะถูกหักคะแนน</p><p>ทางลัด: Enter ยืนยัน · Ctrl+Z ดึงเบี้ยกลับ · Ctrl+R แลกเบี้ย · Ctrl+P ผ่านตา</p><button id="modal-close" class="btn-primary">เข้าใจแล้ว</button></div>`;
      modal.hidden = false;
      document.getElementById("modal-close").addEventListener("click", () => { modal.hidden = true; });
    });
    document.getElementById("btn-settings").addEventListener("click", () => {
      const modal = document.getElementById("modal");
      modal.innerHTML = `<div class="modal-box"><h3>ตั้งค่าการแสดงผล</h3><label class="settings-choice"><input type="checkbox" id="settings-analysis" ${showAmats ? "checked" : ""}> แสดงการวิเคราะห์ AMATS</label><button id="modal-close" class="btn-primary">ปิด</button></div>`;
      modal.hidden = false;
      document.getElementById("settings-analysis").addEventListener("change", e => setAnalysis(e.target.checked));
      document.getElementById("modal-close").addEventListener("click", () => { modal.hidden = true; });
    });
    const cols = document.getElementById("board-col-labels"), rows = document.getElementById("board-row-labels");
    for (let i = 0; i < D.BOARD_SIZE; i++) {
      const col = document.createElement("span"), row = document.createElement("span");
      col.textContent = i + 1; row.textContent = String.fromCharCode(65 + i);
      cols.appendChild(col); rows.appendChild(row);
    }
    document.addEventListener("keydown", e => {
      if (document.getElementById("game-layout").hidden || !document.getElementById("modal").hidden) return;
      if (e.key === "Enter" && !e.ctrlKey) { e.preventDefault(); submitMove(); }
      if (!e.ctrlKey) return;
      const action = { z: () => recallAll(), r: () => openExchangeModal(), p: () => passTurn() }[e.key.toLowerCase()];
      if (action) { e.preventDefault(); action(); }
    });
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") e.currentTarget.hidden = true;
    });
    document.getElementById("btn-profile").addEventListener("click", renderProfileModal);
    document.getElementById("btn-coach-station").addEventListener("click", renderCoachStation);
  });
})();
