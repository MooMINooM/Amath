/* A-Math Supabase Telemetry
 * Remote persistence is best-effort. The local AMATS logger remains a fallback.
 */
const AMATH_SUPABASE_TELEMETRY = (() => {
  function client() {
    return typeof AMATH_AUTH !== "undefined" ? AMATH_AUTH.getClient() : null;
  }

  function iso(ms) {
    return ms ? new Date(ms).toISOString() : null;
  }

  function report(label, error) {
    if (error) console.warn("[A-Math telemetry]", label, error);
  }

  async function startMatch(match) {
    const sb = client();
    if (!sb || !match?.studentUserId) return false;
    const { error } = await sb.from("matches").upsert({
      id: match.id,
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
  }

  async function logTurn(match, entry) {
    const sb = client();
    if (!sb || !match?.studentUserId || !entry) return false;
    const { error } = await sb.from("turn_events").insert({
      match_id: match.id,
      student_user_id: match.studentUserId,
      actor: entry.actor,
      turn_number: entry.turnNumber ?? 0,
      event_type: entry.eventType || "move",
      occurred_at: iso(entry.ts) || new Date().toISOString(),
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
    });
    report("logTurn", error);
    return !error;
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
    const { error } = await sb.from("live_sessions").upsert({
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
    }, { onConflict: "student_user_id" });
    report("syncLive", error);
    return !error;
  }

  return { startMatch, logTurn, finishMatch, syncLive };
})();
