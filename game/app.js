/* A-Math Game — เกมจริง เล่นกับบอท (UI + game loop) */
(() => {
  const D = AMATH_DATA;
  const E = AMATH_ENGINE;
  const BOT = AMATH_GAME_BOT;

  const BONUS_LABEL = { TE: "3E", DE: "2E", TP: "3P", DP: "2P" };

  let board, bag, playerRack, botRack, playerScore, botScore;
  let isFirstMove, currentTurn, pendingCoords, consecutivePasses, gameOver, difficulty;
  let selectedRackIndex = null;
  let turnNumber = 0;
  let showAmats = true;

  function newBoard() { return Array.from({ length: D.BOARD_SIZE }, () => Array(D.BOARD_SIZE).fill(null)); }

  function drawFromBag(rack, count) {
    let drawn = 0;
    while (drawn < count && rack.length < D.RACK_SIZE && bag.length > 0) {
      rack.push(bag.pop());
      drawn++;
    }
  }

  function startGame(diff) {
    difficulty = diff;
    board = newBoard();
    bag = D.buildBag();
    playerRack = []; botRack = [];
    drawFromBag(playerRack, D.RACK_SIZE);
    drawFromBag(botRack, D.RACK_SIZE);
    playerScore = 0; botScore = 0;
    isFirstMove = true; currentTurn = "player"; pendingCoords = [];
    consecutivePasses = 0; gameOver = false; selectedRackIndex = null; turnNumber = 0;
    clearLog();
    log(`เริ่มเกมใหม่ — บอทระดับ ${diff}`);
    document.getElementById("setup-panel").hidden = true;
    document.getElementById("game-panel").hidden = false;
    renderAll();
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    renderBoard();
    renderRack();
    renderStatus();
    renderActions();
    renderAmatsPanel();
  }

  function renderAmatsPanel() {
    const panel = document.getElementById("amats-panel");
    panel.hidden = !showAmats;
    if (!showAmats) return;
    if (!AMATS_BRIDGE.available) {
      document.getElementById("amats-body").innerHTML = `<p class="muted">โหลดโมดูล AMATS ไม่สำเร็จ</p>`;
      return;
    }
    const analysis = AMATS_BRIDGE.analyze({
      board, myScore: playerScore, oppScore: botScore, turnNumber: turnNumber + 1, rack: playerRack,
    });
    const body = document.getElementById("amats-body");
    const modes = AMATS_DATA.MODES;
    const rec = analysis.recommendation;
    body.innerHTML = `
      <div class="amats-grid">
        <div class="amats-stat"><div class="amats-stat-label">GAP</div><div class="amats-stat-value">${analysis.gap}</div></div>
        <div class="amats-stat"><div class="amats-stat-label">Game Phase</div><div class="amats-stat-value">${analysis.phase}</div></div>
        <div class="amats-stat"><div class="amats-stat-label">Rack Health</div><div class="amats-stat-value">${analysis.rackHealth.level}</div></div>
        <div class="amats-stat"><div class="amats-stat-label">Board State</div><div class="amats-stat-value">${analysis.board}</div></div>
        <div class="amats-stat"><div class="amats-stat-label">Threat</div><div class="amats-stat-value">${analysis.threat}</div></div>
      </div>
      ${rec ? `
        <div class="amats-rec">
          <span>ควรเล่นแบบ <span class="amats-mode-badge" style="background:${modes[rec.primary].color}">${rec.primary}</span></span>
          <span class="muted">สำรอง: <span class="amats-mode-badge" style="background:${modes[rec.secondary].color}">${rec.secondary}</span></span>
        </div>
        <ul class="amats-reasons">${rec.reasons.map(r => `<li>${r}</li>`).join("")}</ul>
      ` : ""}
    `;
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
    playerRack.forEach((tile, i) => {
      const slot = document.createElement("div");
      slot.className = "rack-tile" + (i === selectedRackIndex ? " selected" : "");
      slot.innerHTML = `<span class="tile-char">${tile.kind === "blank" ? "?" : tile.face}</span><span class="tile-pts">${tile.points}</span>`;
      slot.addEventListener("click", () => selectRackTile(i));
      el.appendChild(slot);
    });
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
    document.getElementById("player-score").textContent = playerScore;
    document.getElementById("bot-score").textContent = botScore;
    document.getElementById("bag-count").textContent = bag.length;
    document.getElementById("turn-indicator").textContent = gameOver ? "จบเกมแล้ว" : (currentTurn === "player" ? "ตาของคุณ" : "ตาของบอท…");
    document.getElementById("player-panel").classList.toggle("active-turn", currentTurn === "player" && !gameOver);
    document.getElementById("bot-panel").classList.toggle("active-turn", currentTurn === "bot" && !gameOver);
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
    const returned = indices.map(i => playerRack[i]);
    playerRack = playerRack.filter((_, i) => !indices.includes(i));
    bag.push(...returned);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    drawFromBag(playerRack, returned.length);
    log(`คุณแลกเบี้ย ${returned.length} ใบ`);
    consecutivePasses = 0; // แลกเบี้ยคือการเล่นเชิงรุก ไม่นับเป็นการผ่าน
    endTurn();
  }

  /* ---------- Submit / Pass ---------- */
  function submitMove() {
    if (pendingCoords.length === 0) { showToast("ยังไม่ได้วางเบี้ย", "error"); return; }
    const result = E.validateAndScoreMove(board, pendingCoords, isFirstMove);
    if (!result.valid) { showToast(result.error, "error"); return; }

    pendingCoords.forEach(({ r, c }) => { board[r][c].locked = true; board[r][c].isNew = false; });
    playerScore += result.score;
    isFirstMove = false;
    consecutivePasses = 0;
    turnNumber++;
    result.equations.forEach(eq => log(`คุณเล่น "${eq.string}" ได้ ${eq.score} คะแนน`));
    if (result.bingo) { log("BINGO! +40 คะแนนพิเศษ"); showToast("BINGO! +40 คะแนน", "success"); }
    drawFromBag(playerRack, pendingCoords.length);
    pendingCoords = [];
    if (checkImmediateEndgame("player")) return;
    endTurn();
  }

  function passTurn() {
    recallAll();
    log("คุณผ่านตา");
    consecutivePasses++;
    endTurn();
  }

  function endTurn() {
    renderAll();
    if (checkStuckEndgame()) return;
    currentTurn = currentTurn === "player" ? "bot" : "player";
    renderAll();
    if (currentTurn === "bot" && !gameOver) setTimeout(botTakeTurn, 700);
  }

  /* ---------- Bot turn ---------- */
  function botTakeTurn() {
    const move = BOT.findMove(board, botRack, isFirstMove, difficulty, {
      myScore: botScore, oppScore: playerScore, turnNumber: turnNumber + 1,
    });
    if (move.found) {
      move.coords.forEach(({ r, c }, i) => {
        const tile = move.tiles[i];
        board[r][c] = { points: tile.points, resolvedChar: tile.resolvedChar, isNew: false, locked: true, kind: tile.kind, face: tile.face, id: tile.id };
        botRack = botRack.filter(t => t.id !== tile.id);
      });
      botScore += move.score;
      isFirstMove = false;
      consecutivePasses = 0;
      turnNumber++;
      move.equations.forEach(eq => log(`บอทเล่น "${eq.string}" ได้ ${eq.score} คะแนน`));
      if (move.coords.length === D.RACK_SIZE) log("บอททำ BINGO! +40 คะแนน");
      drawFromBag(botRack, move.coords.length);
      if (checkImmediateEndgame("bot")) return;
    } else {
      if (bag.length >= 5 && botRack.length > 0) {
        const n = Math.min(botRack.length, 1 + Math.floor(Math.random() * botRack.length));
        const returned = botRack.splice(0, n);
        bag.push(...returned);
        for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
        drawFromBag(botRack, n);
        log(`บอทแลกเบี้ย ${n} ใบ`);
        consecutivePasses = 0; // แลกเบี้ยคือการเล่นเชิงรุก ไม่นับเป็นการผ่าน
      } else {
        log("บอทผ่านตา (ไม่พบทางเดินที่ถูกกติกา และแลกเบี้ยไม่ได้)");
        consecutivePasses++;
      }
    }
    if (checkStuckEndgame()) return;
    currentTurn = "player";
    renderAll();
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

  function checkStuckEndgame() {
    if (consecutivePasses >= 3) {
      playerScore -= tilePointSum(playerRack);
      botScore -= tilePointSum(botRack);
      endGame("ทั้งสองฝ่ายเล่นต่อไม่ได้ — หักคะแนนเบี้ยที่เหลือในมือของแต่ละฝ่ายออกจากคะแนนตัวเอง");
      return true;
    }
    return false;
  }

  function endGame(reason) {
    gameOver = true;
    renderAll();
    const winner = playerScore > botScore ? "คุณชนะ!" : playerScore < botScore ? "บอทชนะ" : "เสมอกัน";
    log(`จบเกม — ${reason}`);
    log(`ผลสุดท้าย: คุณ ${playerScore} — บอท ${botScore} (${winner})`);
    showToast(`จบเกม: ${winner} (${playerScore} - ${botScore})`, "info");
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
    document.getElementById("amats-toggle").addEventListener("change", (e) => {
      showAmats = e.target.checked;
      renderAmatsPanel();
    });
    document.getElementById("btn-restart").addEventListener("click", () => {
      document.getElementById("game-panel").hidden = true;
      document.getElementById("setup-panel").hidden = false;
    });
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") e.currentTarget.hidden = true;
    });
  });
})();
