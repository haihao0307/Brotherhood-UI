# Dialogue Bubble Readability Optimization Design

**Date:** 2026-03-27
**Status:** Approved for planning
**Scope:** Character-head dialogue bubbles only

## Goal

Improve the readability of the character-head dialogue bubbles in the main UI while preserving the current Liangshan visual language. The minimum delivery must make bubble text look clearer on both Windows and macOS without expanding into a broader typography refactor.

## Current Context

The dialogue bubble text is rendered by Phaser canvas text in [`frontend/js/app-ui-runtime.js`](../../../frontend/js/app-ui-runtime.js), not by DOM text. The game canvas is configured in [`frontend/js/app.js`](../../../frontend/js/app.js) with `pixelArt: true`, and the canvas is styled in [`frontend/css/app.css`](../../../frontend/css/app.css) with `image-rendering: pixelated`.

The current bubble text configuration is effectively:

- `fontSize`: `18px`
- `fontStyle`: `700`
- `strokeThickness`: `1`
- light stroke on dark ink
- fixed line spacing and fixed max width

This combination is likely causing the current blur perception:

1. A relatively small font size for canvas-rendered CJK text.
2. Heavy weight plus stroke causes the glyph edges to fill in.
3. Canvas text is more sensitive than DOM text to scaling and rasterization differences.
4. Windows and macOS render the same font stacks differently, so a single aggressive setting is unlikely to be equally readable on both platforms.

## User-Approved Direction

The approved direction is the balanced option:

- keep the current bubble shape and scene style
- improve readability first
- avoid turning the bubble into a generic system tooltip
- explicitly account for both Windows and macOS users

## In Scope

- Bubble text typography only for character-head dialogue bubbles
- Bubble text token cleanup in the current Phaser implementation
- Platform-aware typography fallback for Windows and macOS if needed
- Readability validation for Chinese and mixed Chinese-English lines

## Out of Scope

- Bottom status board text
- Tools drawer text
- Memo panel text
- Site-wide font system changes
- Replacing Phaser bubble text with DOM/HTML overlays
- Redesigning the bubble body, tail, or motion behavior
- Changes to character animation, scene layout, or theme art

## Design Requirements

### 1. Preserve the existing bubble component model

The implementation must stay inside the current bubble rendering path in [`frontend/js/app-ui-runtime.js`](../../../frontend/js/app-ui-runtime.js). The bubble container, tail, depth, duration, and hero-follow positioning should remain structurally unchanged.

### 2. Optimize readability through typography tokens first

The first-pass solution must come from typography tuning, not architecture replacement. The bubble text configuration should be split into explicit readability tokens so the implementation can control:

- font family stack
- font size
- font weight
- line spacing or line height equivalent
- letter spacing if supported
- horizontal and vertical padding
- max text width
- stroke presence, color, and thickness

The intent is to make the bubble text visually cleaner without changing the scene identity.

### 3. Reduce blur sources rather than adding decoration

The optimization should treat blur as a rendering problem, not a styling problem. The design must prefer:

- less aggressive stroke treatment
- a more stable text weight
- slightly more forgiving bubble spacing
- text contrast that stays strong without relying on glowing edges

The design should not add extra shadows, glow, or ornamental effects to compensate for blur.

### 4. Support both Windows and macOS

The typography strategy must assume that the same canvas text settings will not look identical on both platforms. The minimum delivery may use one shared baseline plus small platform-specific adjustments if testing shows they are needed.

Allowed platform differences:

- font family order
- weight downgrade or upgrade by one step
- minor size or spacing adjustment

Not allowed:

- separate visual design per platform
- different bubble shapes or colors per platform

### 5. Keep the UI visually coherent

After optimization, the bubble must still read as part of the current Liangshan scene. The text should feel clearer and calmer, not more modern than the rest of the interface.

## Recommended Approach

Use the existing Phaser bubble implementation and introduce a dedicated readability-oriented text config for dialogue bubbles.

This approach is recommended because it:

- solves the reported problem at the narrowest layer
- keeps implementation risk low
- avoids reworking bubble tracking and depth behavior
- leaves room for small Windows/macOS adjustments without branching the UI design

## Rejected Alternatives

### 1. Keep the current implementation and only tweak one number

Rejected because the issue is likely caused by multiple interacting factors. A single font-size-only or stroke-only tweak is unlikely to hold up across both platforms.

### 2. Replace bubble text with DOM overlays

Rejected for the minimum delivery because it expands scope into positioning, animation sync, layering, and scene integration. It is a larger architectural change than the problem requires.

### 3. Fold this into a global UI typography pass

Rejected because the user explicitly requested a dialogue-bubble-specific optimization. Expanding scope would slow delivery and make acceptance ambiguous.

## Acceptance Criteria

The minimum delivery is complete when all of the following are true:

1. Character-head dialogue bubble text is visibly clearer than the current version on Windows and macOS Chromium-based browsers.
2. Chinese text no longer appears noticeably fuzzy at the bubble edges in normal viewing conditions.
3. Mixed Chinese-English lines remain balanced and readable without awkward crowding.
4. The bubble still feels like the same component, with no redesign of shape, tail, animation, or placement behavior.
5. No new wrapping regressions, clipping, overflow, or bubble-follow positioning regressions are introduced.

## Validation Plan

Validation should focus on visual readability rather than purely code-level correctness.

Minimum validation:

- compare before and after bubble text with representative Chinese lines
- compare before and after bubble text with mixed Chinese-English lines
- verify the result in Windows
- verify the result in macOS
- verify both main-hero and support-hero bubbles
- verify short and multi-line bubble content

Suggested representative lines:

- `堂前消息已送达，请兄长过目。`
- `Review package is ready.`
- `堂前消息已送达，review package is ready.`

## Risks and Guardrails

### Risk: canvas text remains soft even after token tuning

Guardrail:
Treat typography token tuning as the first pass. Only if acceptance still fails should the follow-up plan inspect whether global canvas rendering settings are interfering with bubble readability.

### Risk: Windows and macOS diverge too much

Guardrail:
Allow small platform-specific token overrides while keeping the same visual direction and component structure.

### Risk: readability improvements make the bubble look out of place

Guardrail:
Preserve the current bubble shape, colors, and follow behavior, and keep any typography changes within the existing scene tone.

## Implementation Boundary for the Next Step

The planning phase should assume the implementation touches the bubble rendering path first, centered on [`frontend/js/app-ui-runtime.js`](../../../frontend/js/app-ui-runtime.js), and only expands beyond that if verification shows the blur is being dominated by global canvas configuration.
