/* Competition clock, 15/5/2569 rules. No DOM or timer-loop dependency. */
const AMATH_CLOCK = (() => {
  const SIDES = ['player', 'bot'];
  const LIMIT = 5 * 60000;
  function penalty(remainingMs) {
    return Math.min(50, Math.ceil(Math.max(0, -remainingMs) / 60000) * 10);
  }
  function create(minutes, now = () => performance.now()) {
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('Invalid clock minutes');
    const remaining = { player: minutes * 60000, bot: minutes * 60000 };
    let active = null, last = now();
    function settle() {
      const time = now();
      if (active) remaining[active] -= Math.max(0, time - last);
      last = time;
    }
    function snapshot() {
      settle();
      return { remainingMs: { ...remaining }, active,
        penalties: Object.fromEntries(SIDES.map(s => [s, penalty(remaining[s])])),
        // The single-side rule says strictly MORE than five minutes.
        expired: SIDES.filter(s => remaining[s] < -LIMIT),
        bothExpired: SIDES.every(s => remaining[s] <= -LIMIT) };
    }
    function switchTo(side) {
      if (!SIDES.includes(side)) throw new Error('Invalid clock side');
      settle(); active = side;
      return snapshot();
    }
    function pause() { settle(); active = null; return snapshot(); }
    return { snapshot, switchTo, pause };
  }
  function adjudicate(scores, rackPoints, clock) {
    const both = clock.bothExpired;
    const loser = both ? null : clock.expired[0];
    const adjusted = Object.fromEntries(SIDES.map(s => [s, scores[s] - clock.penalties[s]]));
    if (both || loser) {
      SIDES.forEach(s => { adjusted[s] -= rackPoints[s]; });
      if (loser) {
        const other = loser === 'player' ? 'bot' : 'player';
        if (adjusted[loser] > adjusted[other]) adjusted[loser] = adjusted[other] - 50;
      }
    }
    return { scores: adjusted, loser, bothLost: both };
  }
  function format(ms) {
    const seconds = Math.ceil(Math.abs(ms) / 1000);
    return `${ms < 0 ? '-' : ''}${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  return { create, penalty, adjudicate, format };
})();
if (typeof module !== 'undefined') module.exports = AMATH_CLOCK;
