# Support Hero Continuous Roaming Design

## Goal

Optimize all support hero roaming in the main idle scene so movement feels less rigid and repetitive, while avoiding obvious logic regressions.

The desired feel is:

- keep each support hero inside its current activity lane
- keep collision-avoidance and scene-transition safety behavior
- replace single-hop random walking with short continuous wandering
- add light per-hero personality differences without splitting the logic into separate AI implementations

## Non-Goals

- no changes to handoff scenes or child scenes
- no pathfinding, obstacle navigation, or cross-lane movement
- no changes to dialogue scheduling, bubble timing, or support-role assignment
- no sprite, asset, or animation content changes

## Current Behavior Summary

Current roaming in `frontend/js/app-theme-roaming.js` works as:

1. derive a rectangular roaming bound for each support hero from main-scene cast positions
2. wait for a randomized pause
3. pick one random target inside bounds
4. walk in a straight line to that target
5. stop, pause again, then repeat

This is stable, but it reads visually as repeated random point-to-point jumps. Because each decision is isolated, direction changes can feel abrupt and the motion lacks short-term continuity.

## Proposed Approach

Adopt a single shared roaming system based on continuous roaming bursts.

Each support hero still owns one lane and one roaming state object. The change is that a hero no longer thinks in single isolated targets. Instead, a hero enters a short roaming burst containing multiple linked micro-targets.

Within one burst:

- the hero travels through 2 to 4 short segments
- each next segment is biased by the previous movement direction
- vertical drift remains shallow and bounded
- when the hero has drifted far from the base position, target scoring biases back toward the base area

Between bursts:

- the hero pauses as before
- bubble emphasis can still suppress roaming
- entering handoff or child scenes still disables roaming entirely

This preserves the existing safety model while improving perceived naturalness.

## Architecture

The change stays local to the roaming runtime and theme configuration.

### Runtime

`frontend/js/app-theme-roaming.js`

- extend per-hero roaming state to track burst progress and directional memory
- replace the current single-target picker with a burst-aware next-segment picker
- keep existing enable, reset, pause, and update entry points intact so the rest of the engine contract does not change

### Theme Config

`frontend/themes/liangshan/theme.json`

- keep current global roaming bounds and timing config
- add optional burst-related knobs for shared behavior
- add per-hero roaming personality overrides under `mainScene.supportRoaming.heroProfiles[heroId]`

### Theme Runtime Parsing

`frontend/js/app-theme-runtime.js`

- normalize new roaming config fields
- provide safe defaults so missing new fields preserve valid behavior

## Detailed Behavior

### 1. Roaming State Model

Each support hero roaming state will track:

- `target`: current micro-target
- `pauseUntil` and `nextDecisionAt`: existing scheduling gates
- `speedPxPerSec`: current movement speed
- `lastMoveDir`: existing left/right orientation memory
- `burstRemaining`: number of linked segments left in the current roaming burst
- `burstAnchor`: approximate starting point for the current burst, used to prevent endless drifting
- `lastHeadingX` and `lastHeadingY`: last resolved movement vector, used to bias the next segment

If these extra fields are missing or reset, runtime must treat the hero as idle and recover cleanly.

### 2. Burst Lifecycle

Idle roaming follows this loop:

1. wait until the hero is allowed to move
2. if no active burst exists, start one with a randomized segment count
3. pick the next micro-target
4. walk to it
5. if the burst still has remaining segments, pick the next micro-target immediately or after a very short in-burst hesitation
6. when the burst ends, enter the normal pause window

This creates visible continuity while keeping hard pauses between bursts.

### 3. Target Selection Rules

The next micro-target must satisfy these rules:

- remain inside the hero's roaming bounds
- remain sufficiently separated from other support heroes' active positions or active targets
- avoid overshooting too far from the hero's base position
- prefer short-to-medium segments over long jumps
- prefer continuing roughly in the previous heading, but not infinitely

Candidate scoring should combine:

- separation from nearby support heroes
- directional continuity with the last segment
- moderate distance from current position
- pull-back score when the hero is far from base or burst anchor
- a small random jitter so repeated paths are not deterministic

The system should still fall back to the best available safe candidate when no candidate clears the preferred separation threshold, matching the current defensive pattern.

### 4. Vertical Movement

Vertical movement remains subtle.

- micro-targets may vary vertically within the existing top/bottom bound
- scoring should prefer smaller vertical offsets than horizontal offsets
- per-hero personality may slightly widen or narrow vertical drift

This keeps the cast visually grounded in the same depth band.

### 5. Per-Hero Personality

All support heroes use the same burst logic, with light parameter overrides:

- `wuyong`: calmer, fewer segments, slightly longer pauses, smaller horizontal variance
- `sunerniang`: livelier, more segments, slightly higher vertical drift, more frequent direction changes
- `wusong`: stronger forward commitment, slightly longer segments, lower turn-back rate
- `linchong`: balanced movement, smoother heading continuity, fewer abrupt reversals
- `luzhishen`: slightly larger steps with clearer pause beats so motion does not become fidgety

These are tuning differences only. No hero gets unique control flow.

## Configuration Design

Global roaming config should gain safe optional fields such as:

- burst segment count range
- in-burst hesitation range
- directional continuity weight
- base-return weight
- preferred segment length range
- vertical drift weight

Per-hero overrides should support a small subset of multipliers or ranges, for example:

- burst count multiplier or explicit range override
- pause multiplier
- speed multiplier
- segment length multiplier
- turn bias
- vertical drift multiplier

Per-hero overrides live under `mainScene.supportRoaming.heroProfiles`, keyed by support hero id.

If any override is omitted, runtime uses normalized global defaults.

## Error Handling and Safety

The following behavior must remain true:

- if roaming is disabled, actors return to stable idle behavior
- if a bubble emphasis is active and `pauseDuringBubble` is enabled, roaming pauses without corrupting burst state
- if the scene leaves `main_idle`, roaming is disabled and transient targets are cleared
- if config is incomplete or malformed, normalization falls back to safe defaults instead of throwing
- if a target cannot be picked, the hero should schedule another pause instead of entering a bad loop

Additional safeguards:

- clamp all derived target coordinates to bounds before use
- clamp any normalized burst counts to at least 1 segment
- ensure pause and hesitation ranges cannot produce negative timing
- prevent permanent in-burst chaining by forcing a burst end when counters are exhausted

## Testing Strategy

Follow test-first implementation for the changed behavior.

### Runtime Parsing Tests

Add tests covering:

- new roaming config fields normalize with defaults
- malformed or partial burst config does not break runtime theme creation
- per-hero overrides merge safely with global defaults

### Roaming Logic Tests

Add focused tests for roaming helpers to cover:

- burst initialization produces a valid segment count
- picked targets stay within bounds
- candidate scoring prefers continuity but still respects safety constraints
- far-from-base states bias movement back inward
- fallback behavior still returns a best safe target when ideal separation is unavailable

### Behavior Regression Tests

Verify existing guarantees:

- bubble pause still suppresses roaming
- disabling roaming clears targets and restores idle animation
- entering and leaving main idle resets roaming safely
- support heroes do not remain stuck with a never-ending target chain

## Implementation Notes

Keep the implementation incremental:

1. add config normalization and helper scaffolding
2. add tests for new helper behavior
3. replace target selection and update flow with burst-aware logic
4. tune theme config values for Liangshan support heroes
5. run frontend tests plus targeted runtime verification

## Risks and Mitigations

### Risk: movement becomes too busy

Mitigation:

- keep burst length short
- preserve meaningful pauses between bursts
- keep vertical drift small
- give calmer personalities to heroes that should read as composed

### Risk: heroes oscillate near lane edges

Mitigation:

- include base-return bias
- score down candidates that extend drift when already far from base

### Risk: support heroes visually crowd each other

Mitigation:

- preserve current minimum separation logic
- evaluate separation against other active targets as well as visible positions

### Risk: edge-case stalls from overly strict candidate filters

Mitigation:

- retain best-candidate fallback
- if no target is usable, re-enter pause instead of retrying immediately in a tight loop

## Acceptance Criteria

This design is complete when:

- all support heroes use burst-based continuous roaming in `main_idle`
- movement looks less fixed and less robotic than the current single-hop pattern
- all heroes still remain inside their own lanes
- no obvious regressions appear in bubble pause, scene transition, or idle recovery behavior
- per-hero differences are visible but subtle
