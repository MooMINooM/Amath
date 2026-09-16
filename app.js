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
  let turnStartRack = [];
  let turnStartBoard = null;
  let turnHistory = [];
  let opponentProfile = null; // V3: โปรไฟล์ผู้เล่น (จาก V2) ที่บอทใช้ปรับน้ำหนักการตัดสินใจของตัวเอง

  const RACK_TONE = { Excellent: "good", Good: "good", Stable: "accent", Weak: "warn", Critical: "bad" };
  const BOARD_TONE = { Open: "good", Balanced: "accent", Controlled: "accent", Restricted: "warn", Dangerous: "bad" };
  const THREAT_TONE = { Low: "good", Medium: "accent", High: "warn", Critical: "bad" };

  function cloneBoardDeep(b) { return b.map(row => row.map(cell => (cell ? { ...cell } : null))); }

  function sizeBoard() {
    const wrap = document.getElementById("board-wrap");
    const boardEl = document.getElementById("board");
    if (!wrap || !boardEl) return;
    const size = Math.max(200, Math.min(wrap.clientWidth, wrap.clientHeight));
    boardEl.style.width = size + "px";
    boardEl.style.height = size + "px";
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
    difficulty = diff;
    board = newBoard();
    bag = D.buildBag();
    playerRack = []; botRack = [];
    drawFromBag(playerRack, D.RACK_SIZE);
    drawFromBag(botRack, D.RACK_SIZE);
    playerScore = 0; botScore = 0;
    isFirstMove = true; currentTurn = "player"; pendingCoords = [];
    consecutivePasses = 0; gameOver = false; selectedRackIndex = null; turnNumber = 0;
    turnHistory = [];
    const profile = typeof AMATS_PROFILE !== "undefined" ? AMATS_PROFILE.computeProfile() : null;
    opponentProfile = profile && !profile.insufficient ? profile : null;
    turnStartRack = playerRack.slice();
    turnStartBoard = cloneBoardDeep(board);
    clearLog();
    log(`เริ่มเกมใหม่ — บอทระดับ ${diff}`);
    document.getElementById("setup-panel").hidden = true;
    document.getElementById("game-layout").hidden = false;
    document.getElementById("bottom-bar").hidden = false;
    document.getElementById("topbar-status").hidden = false;
    document.getElementById("summary-overlay").hidden = true;
    AMATS_LOGGER.startMatch({ opponentType: "bot", difficulty: diff });
    renderAll();
    sizeBoard();
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
    const panel = document.getElementById("amats-panel");
    panel.hidden = !showAmats;
    if (!showAmats) return;
    if (!AMATS_BRIDGE.available) {
      document.getElementById("amats-body").innerHTML = `<p class="muted">โหลดโมดูล AMATS ไม่สำเร็จ</p>`;
      return;
    }
    const analysis = AMATS_BRIDGE.analyze({
      board, myScore: playerScore, oppScore: botScore, turnNumber: turnNumber + 1, rack: playerRack, opponentDifficulty: difficulty,
    });
    const body = document.getElementById("amats-body");
    const modes = AMATS_DATA.MODES;
    const rec = analysis.recommendation;
    const primaryColor = rec ? modes[rec.primary].color : "#94a3b8";

    const modeGrid = Object.keys(modes).map(key => {
      const isPrimary = rec && rec.primary === key;
      const isSecondary = rec && rec.secondary === key;
      return `<div class="mode-chip${isPrimary ? " is-primary" : ""}${isSecondary ? " is-secondary" : ""}" style="--mc:${modes[key].color}">${key}</div>`;
    }).join("");

    body.innerHTML = `
      <div class="coach-head">
        <div class="coach-strategy">
          <div class="amats-stat-label">กลยุทธ์ปัจจุบัน</div>
          <div class="mode-chip is-primary coach-strategy-badge" style="--mc:${primaryColor}">${rec ? rec.primary : "-"}</div>
        </div>
        <div class="coach-confidence">
          <div class="amats-stat-label">ความมั่นใจ</div>
          <div class="confidence-ring" style="--pct:${analysis.confidence ?? 0}"><span>${analysis.confidence ?? 0}%</span></div>
        </div>
      </div>
      <div class="coach-meta muted">GAP ${analysis.gap} · ${analysis.phase}</div>
      ${rec ? `<div class="advice-box">💡 ${rec.reasons[0]}</div>` : ""}
      <div class="section-title">การประเมินสถานการณ์</div>
      <div class="situ-grid">
        ${situationStat("Rack", analysis.rackHealth.level, analysis.rackHealth.pct, RACK_TONE[analysis.rackHealth.level] || "accent")}
        ${situationStat("Board", analysis.board, analysis.boardPct, BOARD_TONE[analysis.board] || "accent")}
        ${situationStat("Threat", analysis.threat, analysis.threatPct, THREAT_TONE[analysis.threat] || "accent")}
      </div>
      <div class="section-title">โหมดกลยุทธ์ AMATS</div>
      <div class="amats-mode-grid">${modeGrid}</div>
      ${rec && rec.reasons.length > 1 ? `<ul class="amats-reasons">${rec.reasons.slice(1).map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
    `;
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
    document.getElementById("bag-meter-text").textContent = `${bag.length}/100`;
    document.getElementById("bag-meter-fill").style.width = Math.round((bag.length / 100) * 100) + "%";
    const estTotal = AMATS_BRIDGE.totalTurns || 20;
    document.getElementById("turn-progress-text").textContent = `${turnNumber + 1}/${estTotal}`;
    document.getElementById("diff-progress-text").textContent = difficulty || "-";
    const rackPct = AMATS_BRIDGE.available ? AMATS_BRIDGE.rackHealth(playerRack).pct : 0;
    document.getElementById("rack-power-fill").style.width = rackPct + "%";
    document.getElementById("rack-power-text").textContent = rackPct + "%";
  }

  function pushHistory(entry) {
    turnHistory.unshift(entry);
    renderHistoryTable();
  }

  function renderHistoryTable() {
    const el = document.getElementById("history-table");
    if (!el) return;
    if (turnHistory.length === 0) { el.innerHTML = `<p class="muted">ยังไม่มีการเล่น</p>`; return; }
    el.innerHTML = `
      <div class="history-row history-head"><span>ตา</span><span>ผู้เล่น</span><span>แต้ม</span><span>สมการ</span></div>
      ${turnHistory.slice(0, 12).map(h => `
        <div class="history-row ${h.actor}">
          <span>${h.turnNumber}</span>
          <span>${h.actor === "player" ? "ผู้เล่น" : "BOT"}</span>
          <span class="history-score">+${h.score}</span>
          <span class="history-eq">${h.equation}</span>
        </div>`).join("")}
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
    document.getElementById("rack-count-text").textContent = `${playerRack.length}/${D.RACK_SIZE}`;
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
    document.getElementById("bot-score").textContent = botScore;
    document.getElementById("bag-count").textContent = bag.length;
    document.getElementById("turn-indicator").textContent = gameOver ? "จบเกมแล้ว" : (currentTurn === "player" ? "ตาของคุณ" : "ตาของบอท…");
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
    consecutivePasses = 0;
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
    recallAll();
    log("คุณผ่านตา");
    consecutivePasses++;
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
    if (currentTurn === "bot" && !gameOver) setTimeout(botTakeTurn, 700);
  }

  /* ---------- Bot turn ---------- */
  function botTakeTurn() {
    const move = BOT.findMove(board, botRack, isFirstMove, difficulty, {
      myScore: botScore, oppScore: playerScore, turnNumber: turnNumber + 1, opponentProfile,
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
        consecutivePasses = 0; // แลกเบี้ยคือการเล่นเชิงรุก ไม่นับเป็นการผ่าน
      } else {
        log("บอทผ่านตา (ไม่พบทางเดินที่ถูกกติกา และแลกเบี้ยไม่ได้)");
        consecutivePasses++;
      }
      AMATS_LOGGER.logBotTurn(turnNumber, 0);
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
    const result = playerScore > botScore ? "win" : playerScore < botScore ? "loss" : "draw";
    log(`จบเกม — ${reason}`);
    log(`ผลสุดท้าย: คุณ ${playerScore} — บอท ${botScore} (${winner})`);
    showToast(`จบเกม: ${winner} (${playerScore} - ${botScore})`, "info");
    const finished = AMATS_LOGGER.finalizeMatch({ result, finalPlayerScore: playerScore, finalBotScore: botScore });
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
      document.getElementById("game-layout").classList.toggle("no-amats", !showAmats);
      renderAmatsPanel();
      sizeBoard();
    });
    document.getElementById("btn-restart").addEventListener("click", () => {
      document.getElementById("game-layout").hidden = true;
      document.getElementById("bottom-bar").hidden = true;
      document.getElementById("topbar-status").hidden = true;
      document.getElementById("setup-panel").hidden = false;
    });
    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.id === "modal") e.currentTarget.hidden = true;
    });
    document.getElementById("btn-profile").addEventListener("click", renderProfileModal);
  });
})();
