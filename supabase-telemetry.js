/* A-Math Supabase Telemetry
 * Remote persistence is best-effort. The local AMATS logger remains a fallback.
 */
const AMATH_SUPABASE_TELEMETRY = (() => {
  const pendingMatchStarts = new Map();
  let broadcastChannel = null;
  let broadcastReady = null;
  let generationChannel = null;
  let currentGeneration = null;
  let generationPromise = null;
  let generationResetHandler = null;

  function ensureBroadcastChannel() {
    const sb = client();
    if (!sb) return Promise.resolve(null);
    if (broadcastChannel && broadcastReady) return broadcastReady;

    broadcastChannel = sb.channel("amath-pitwall-broadcast", {
      config: { broadcast: { self: false } },
    });

    broadcastReady = new Promise(resolve => {
      let settled = false;
      broadcastChannel.subscribe(status => {
        if (status === "SUBSCRIBED" && !settled) {
          settled = true;
          resolve(broadcastChannel);
        } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !settled) {
          settled = true;
          console.warn("[A-Math telemetry] broadcast unavailable:", status);
          resolve(null);
        }
      });
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(broadcastChannel);
        }
      }, 1200);
    });

    return broadcastReady;
  }

  async function broadcast(event, payload) {
    try {
      const channel = await ensureBroadcastChannel();
      if (!channel) return false;
      const result = await channel.send({ type: "broadcast", event, payload });
      return result === "ok";
    } catch (e) {
      console.warn("[A-Math telemetry] broadcast", event, e);
      return false;
    }
  }

  function client() {
    return typeof AMATH_AUTH !== "undefined" ? AMATH_AUTH.getClient() : null;
  }

  async function ensureGeneration() {
    if (currentGeneration != null) return currentGeneration;
    if (generationPromise) return generationPromise;
    const sb = client();
    if (!sb) return 1;
    generationPromise = (async () => {
      const { data,error } = await sb
        .from("amath_system_state")
        .select("generation")
        .eq("id",1)
        .maybeSingle();
      if (error) {
        report("generation:read", error);
        currentGeneration = 1;
      } else {
        currentGeneration = Number(data?.generation) || 1;
      }
      return currentGeneration;
    })();
    try { return await generationPromise; }
    finally { generationPromise = null; }
  }

  async function watchGeneration(onReset) {
    generationResetHandler = typeof onReset === "function" ? onReset : null;
    const initial = await ensureGeneration();
    const sb = client();
    if (!sb) return initial;

    if (generationChannel) await sb.removeChannel(generationChannel);
    generationChannel = sb()
      .channel("amath-student-reset-generation")
      .on("postgres_changes", {
        event:"UPDATE",
        schema:"public",
        table:"amath_system_state",
        filter:"id=eq.1"
      }, payload => {
        const next = Number(payload.new?.generation);
        if (!Number.isFinite(next)) return;
        const previous = currentGeneration;
        currentGeneration = next;
        if (previous != null && next !== previous && generationResetHandler) {
          generationResetHandler(next, previous);
        }
      })
      .subscribe();
    return initial;
  }

  async function stopGenerationWatch() {
    const sb = client();
    if (sb && generationChannel) await sb.removeChannel(generationChannel);
    generationChannel = null;
    generationResetHandler = null;
  }

  function generation() {
    return currentGeneration;
  }

  function iso(ms) {
    return ms ? new Date(ms).toISOString() : null;
  }

  function report(label, error) {
    if (error) console.warn("[A-Math telemetry]", label, error);
  }

  function startMatch(match) {
    const sb = client();
    if (!sb || !match?.studentUserId) return Promise.resolve(false);
    const task = (async () => {
      const generation = await ensureGeneration();
      const { error } = await sb.from("matches").upsert({
        id: match.id,
        generation,
        student_user_id: match.studentUserId,
        student_code: match.studentCode,
        student_name: match.studentName,
        class_name: match.className,
        room_no: match.roomNo,
        opponent_type: match.opponentType || "bot",
        difficulty: match.difficulty,
        ruleset_id: match.rulesetId,
        ruleset_label: match.rulesetLabel,
        status: "active",
        started_at: iso(match.startedAt),
        updated_at: new Date().toISOString(),
      });
      report("startMatch", error);
      return !error;
    })();
    pendingMatchStarts.set(match.id, task);
    task.finally(() => pendingMatchStarts.delete(match.id));
    return task;
  }

  async function waitForMatch(matchId) {
    const pending = pendingMatchStarts.get(matchId);
    if (pending) await pending;
  }

  async function logTurn(match, entry) {
    const sb = client();
    if (!sb || !match?.studentUserId || !entry) return false;

    const generation = await ensureGeneration();
    const occurredAt = iso(entry.ts) || new Date().toISOString();
    const liveTurn = {
      id: `live-${entry.ts || Date.now()}-${entry.actor || "turn"}`,
      match_id: match.id,
      generation,
      student_user_id: match.studentUserId,
      actor: entry.actor,
      turn_number: entry.turnNumber ?? 0,
      event_type: entry.eventType || "move",
      occurred_at: occurredAt,
      move_score: entry.moveScore ?? null,
      equation: entry.equation ?? null,
      decision_time_ms: entry.decisionTimeMs ?? null,
      decision_quality: entry.decisionQuality ?? null,
      tactical_loss: entry.tacticalLoss ?? null,
      move_value: entry.moveValue ?? null,
      best_move_value: entry.bestMoveValue ?? null,
      gap_before: entry.gapBefore ?? null,
      gap_after: entry.gapAfter ?? null,
      rack_before: entry.rackBefore ?? null,
      rack_after: entry.rackAfter ?? null,
      board_state: entry.boardState ?? null,
      threat_before: entry.threatBefore ?? null,
      suggested_mode: entry.suggestedMode ?? null,
      raw: entry,
      _broadcast: true,
    };
    broadcast("turn_event", liveTurn);

    await waitForMatch(match.id);

    const fullPayload = {
      match_id: match.id,
      student_user_id: match.studentUserId,
      actor: entry.actor,
      turn_number: entry.turnNumber ?? 0,
      event_type: entry.eventType || "move",
      occurred_at: occurredAt,
      move_score: entry.moveScore ?? null,
      equation: entry.equation ?? null,
      decision_time_ms: entry.decisionTimeMs ?? null,
      decision_quality: entry.decisionQuality ?? null,
      tactical_loss: entry.tacticalLoss ?? null,
      move_value: entry.moveValue ?? null,
      best_move_value: entry.bestMoveValue ?? null,
      gap_before: entry.gapBefore ?? null,
      gap_after: entry.gapAfter ?? null,
      rack_before: entry.rackBefore ?? null,
      rack_after: entry.rackAfter ?? null,
      board_state: entry.boardState ?? null,
      threat_before: entry.threatBefore ?? null,
      suggested_mode: entry.suggestedMode ?? null,
      opponent_opportunity: entry.opponentOpportunity ?? null,
      opponent_next_score: entry.opponentNextScore ?? null,
      raw: entry,
    };

    let result = await sb.from("turn_events").insert(fullPayload);
    if (!result.error) return true;

    report("logTurn:first-attempt", result.error);

    // Older databases can exist without optional telemetry columns because
    // CREATE TABLE IF NOT EXISTS does not evolve an existing schema.
    // Preserve the turn instead of dropping the entire row.
    const compatPayload = {
      match_id: match.id,
      student_user_id: match.studentUserId,
      actor: entry.actor,
      turn_number: entry.turnNumber ?? 0,
      event_type: entry.eventType || "move",
      occurred_at: occurredAt,
      move_score: entry.moveScore ?? null,
      equation: entry.equation ?? null,
      decision_time_ms: entry.decisionTimeMs ?? null,
      decision_quality: entry.decisionQuality ?? null,
      tactical_loss: entry.tacticalLoss ?? null,
      move_value: entry.moveValue ?? null,
      best_move_value: entry.bestMoveValue ?? null,
      gap_before: entry.gapBefore ?? null,
      gap_after: entry.gapAfter ?? null,
      rack_before: entry.rackBefore ?? null,
      rack_after: entry.rackAfter ?? null,
      board_state: entry.boardState ?? null,
      threat_before: entry.threatBefore ?? null,
      suggested_mode: entry.suggestedMode ?? null,
      raw: entry,
    };

    await new Promise(resolve => setTimeout(resolve, 250));
    result = await sb.from("turn_events").insert(compatPayload);
    report("logTurn:compat-retry", result.error);
    return !result.error;
  }

  async function finishMatch(match) {
    const sb = client();
    if (!sb || !match?.studentUserId) return false;
    const { error } = await sb.from("matches").update({
      status: "finished",
      finished_at: iso(match.finishedAt),
      result: match.result,
      final_player_score: match.finalPlayerScore,
      final_bot_score: match.finalBotScore,
      end_reason: match.endReason,
      clock: match.clock,
      summary: match.summary,
      updated_at: new Date().toISOString(),
    }).eq("id", match.id).eq("student_user_id", match.studentUserId);
    report("finishMatch", error);
    return !error;
  }

  async function syncLive(state) {
    const sb = client();
    if (!sb || !state?.studentUserId) return false;
    if (state.matchId) await waitForMatch(state.matchId);

    const payload = {
      student_user_id: state.studentUserId,
      match_id: state.matchId || null,
      student_code: state.studentCode,
      student_name: state.studentName,
      class_name: state.className,
      room_no: state.roomNo,
      status: state.status || "playing",
      ruleset_id: state.rulesetId,
      difficulty: state.difficulty,
      turn_number: state.turnNumber ?? 0,
      active_side: state.activeSide || null,
      player_score: state.playerScore ?? 0,
      bot_score: state.botScore ?? 0,
      bag_count: state.bagCount ?? null,
      player_time_ms: state.playerTimeMs ?? null,
      bot_time_ms: state.botTimeMs ?? null,
      decision_quality: state.decisionQuality ?? null,
      tactical_loss: state.tacticalLoss ?? null,
      win_probability: state.winProbability ?? null,
      pressure_level: state.pressureLevel ?? null,
      rack_quality: state.rackQuality ?? null,
      board_snapshot: state.boardSnapshot ?? null,
      rack_snapshot: state.rackSnapshot ?? null,
      last_equation: state.lastEquation ?? null,
      last_move_score: state.lastMoveScore ?? null,
      updated_at: new Date().toISOString(),
    };

    // Broadcast first: the Pitwall can update immediately without waiting for a DB commit.
    broadcast("live_state", {
      ...payload,
      risk_level: state.riskLevel ?? null,
      analytics_version: state.analyticsVersion ?? null,
      _broadcast: true,
      _sent_at: Date.now()
    });

    let result = await sb.from("live_sessions").upsert(payload, { onConflict: "student_user_id" });
    if (result.error) {
      report("syncLive:first-attempt", result.error);
      await new Promise(resolve => setTimeout(resolve, 300));
      payload.updated_at = new Date().toISOString();
      result = await sb.from("live_sessions").upsert(payload, { onConflict: "student_user_id" });
    }
    report("syncLive", result.error);
    return !result.error;
  }

  return { startMatch, logTurn, finishMatch, syncLive };
})();
