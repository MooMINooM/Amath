# AMATS Analytics v2

Version: `AMATS_ANALYTICS_V2`

These metrics are game analytics. They are not psychological, medical, or psychometric measurements.

## Tactical Loss

Two values are retained:

- **Tactical Loss (points)** = `max(0, Best Move Value - Chosen Move Value)`
- **Tactical Loss %** = normalized regret for comparison across turns

The adaptive normalization scale is:

`scale = clamp(|Best Move Value| × 0.35 + 8, 10, 30)`

`Tactical Loss % = 100 × (1 - exp(-LossPoints / scale))`

The raw point value remains the value used for Critical Move detection and Replay inspection.

## Decision Quality (DQ)

`DQ = 100 - Tactical Loss %`

This keeps DQ and normalized regret directly interpretable as complements.

## Rack Quality

Rack Quality uses the existing AMATS rack-health heuristic based on the actual eight-tile rack:

- availability of `=`
- operator variety
- flexible common numbers
- blank tiles
- penalties for too many difficult high numbers

The rack-health score is normalized to 0–100.

Both `rackQualityBefore` and `rackQualityAfter` are stored for new turns.

## Pressure

Pressure is a 0–100 **game-state pressure indicator**, not a mental-state measurement.

Available components are reweighted if one is missing:

- 45% time depletion
- 30% score closeness
- 25% game progression from bag depletion

Higher values mean the game state requires more immediate decision discipline.

## Risk

Risk is a 0–100 **board-exposure indicator**:

- 65% current premium-cell threat
- 35% opponent opportunity opened by the chosen move

Higher values mean the move/state exposes more scoring opportunity to the opponent.

## Phase

For telemetry recorded from v1.6 onward:

- Opening: bag > 65%
- Midgame: bag 25–65%
- Endgame: bag < 25%

Older telemetry without bag count falls back to turn ranges 1–10, 11–20, 21+.

## Data versioning

New turns store these fields in `turn_events.raw`:

- `analyticsVersion`
- `decisionQualityV2`
- `tacticalLossPctV2`
- `tacticalLossScaleV2`
- `rackQualityBefore`
- `rackQualityAfter`
- `pressureV2`
- `riskV2`
- `threatPctBefore`

Raw legacy values remain available for backward compatibility.
