# Dialogue Bubble Adaptive Duration Design

## Goal

Make dialogue bubbles stay visible long enough to read comfortably by adapting display duration more noticeably to text length. Short lines should only be slightly longer than today, while long lines should remain visible substantially longer.

## Scope

This change only adjusts automatic dialogue bubble display duration for:

- Main worker dialogue loop
- Support worker dialogue loop
- Idle random event dialogue bubbles

This change does not alter:

- Dialogue selection rules
- Scheduler interval windows
- Bubble rendering, layout, or animation
- Handoff status bubble timing outside the dialogue scheduler

## Current Problem

The current main/support loop duration is computed inline as `clamp(line.length * 180, 2600, 5200)`.

That creates two readability issues:

1. Long lines hit the `5200ms` ceiling too early and disappear before the user finishes reading.
2. Duration logic is duplicated in multiple scheduler paths, making future tuning inconsistent.

## Recommended Approach

Introduce a shared duration calculator in `frontend/js/app-dialogue-runtime.js` and route all scheduled dialogue bubble timings through it.

The calculator should:

- Add a higher base duration so short lines feel slightly less rushed
- Scale more aggressively with text length so long lines gain meaningfully more time
- Add a small bonus for punctuation and multi-line content because these often imply additional reading pauses
- Clamp to a wider upper bound so unusually long lines can stay visible long enough without becoming excessive

## Duration Model

Use a unified function shaped like:

`duration = base + (effectiveLength * perCharMs) + punctuationBonus + lineBreakBonus`

Planned behavior targets:

- Very short lines: roughly `3200ms` to `3800ms`
- Medium lines: roughly `4500ms` to `6500ms`
- Long lines: up to roughly `8500ms` to `9000ms`

Implementation details can be tuned during TDD, but the function should preserve these behavior bands.

## Integration Points

Update the scheduler so the shared duration helper is used by:

- Main dialogue loop in `scheduleNextMainDialogue`
- Support dialogue loop in `scheduleNextSupportDialogue`
- Idle random event trigger path when an event does not already specify a stronger explicit duration

If an idle random event or theme config already provides an explicit `durationMs`, that explicit value should still win when it is longer than the computed readability duration.

## Testing Strategy

Add tests first for the duration helper and scheduler integration. The tests should verify:

- Short text gets only a modest increase over the old floor
- Long text receives a noticeably longer duration than before
- Longer text always gets at least as much time as shorter text
- Explicit event durations are preserved when they exceed the computed readability duration
- Main and support dialogue loops both use the shared calculator instead of hard-coded formulas

## Risks And Guardrails

- Overlong bubbles could slow scene cadence too much
  - Guardrail: clamp the maximum duration
- Inconsistent behavior between dialogue types
  - Guardrail: centralize duration calculation in dialogue runtime
- Theme-authored explicit durations could be unintentionally weakened
  - Guardrail: treat explicit configured durations as authoritative when longer
