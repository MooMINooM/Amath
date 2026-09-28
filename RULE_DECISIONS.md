# Clock rules — Beta Core 0.2

Source: `รายละเอียดการแข่งขัน_เอแม็ท_v.25690515.pdf`, page 2 (15 May 2569).

- PRIMARY_70 gets 20 minutes per side; STANDARD_100 gets 22.
- Overtime costs 10 points per started minute. At exactly zero: no penalty; 1 ms over: 10; exactly 60 seconds over: 10; 60 seconds + 1 ms: 20.
- A single side forfeits strictly **more than** five minutes overtime, matching the document's “เกิน 5 นาที”. Exactly -05:00 has a 50-point penalty but is not yet a single-side forfeit. Both sides at or below -05:00 are both losses per the separate “ถึง 5 นาที” clause.
- A delayed callback cannot increase a forfeit penalty above 50. Decisions check elapsed time before mutating the board, including after synchronous bot search.
- Normal endings keep existing rack settlement, then deduct time once. Time forfeits deduct both racks and time; if the forfeiting side still leads after deductions, set its score to opponent's adjusted score minus 50. This uses net scores for both sides consistently; organizer confirmation is advisable for the unspecified opponent-rack treatment in a time forfeit.
- If deductions leave equal scores, preserve them but explicitly award the win to the other side. The document only specifies the 50-point adjustment when the forfeiting side still has **more** points.
- Clock metadata and end reason are stored with the match. Forfeits override score-based result calculation; simultaneous loss is `double_loss`.

## Local game timing

The monotonic clock measures elapsed time, not callback counts. Modal decisions and bot search consume the active side's time. At accepted submission/pass/exchange the clock pauses for automatic UI, scoring, drawing and analytics, then starts the next side after processing. This is an explicit digital-game convention: human referee/hold/challenge handling is not yet implemented. `pause()` is available for that future integration. Restart cancels both the display timer and queued bot turn.

The game still uses Auto Judge and player-first opening. This PR does not claim full competition compliance. Clock state is in-memory; refresh does not restore a match. Browser/OS suspension behavior and a trusted server clock remain future work.

## Verification

Run `node --test tests/*.test.cjs`. Tests cover both durations, clock switching and pause, minute boundaries, delayed callbacks, forfeit score outcomes, pending tile deduction, bot computation crossing the limit, normal settlement and duplicate finalization.

JavaScript syntax and `git diff --check` pass. A real-browser smoke test was attempted but could not launch because this runtime has no Playwright Chromium executable; visual/browser verification is still pending.
