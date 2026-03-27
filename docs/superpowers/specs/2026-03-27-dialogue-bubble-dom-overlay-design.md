# Dialogue Bubble DOM Overlay Text Design

**Date:** 2026-03-27
**Status:** Approved in conversation, pending written spec review
**Scope:** Character-head dialogue bubble text layer only
**Supersedes:** `docs/superpowers/specs/2026-03-27-dialogue-bubble-readability-design.md` for the text-rendering approach only

## Goal

Replace the dialogue bubble text rendering with a DOM overlay layer so the text becomes visibly sharper on Windows and macOS while preserving the current Liangshan bubble body, tail, timing, and hero-follow behavior.

This follow-up exists because typography-token tuning inside the Phaser canvas improved correctness and regression coverage, but did not create a strong enough visual readability gain once the text was still rendered through a pixel-art canvas pipeline.

## Confirmed Product Decisions

The following decisions were confirmed during brainstorming and define this follow-up scope:

- Only the bubble text layer should move to DOM.
- The bubble body and tail should remain in the current Phaser-rendered component.
- This is a readability-first change, not a broader bubble redesign.
- The minimum delivery must keep automated regression coverage.

## Current Context

The current bubble renderer in [`frontend/js/app-ui-runtime.js`](../../../frontend/js/app-ui-runtime.js) still creates the text with `scene.add.text(...)`, even after the previous readability pass introduced better typography tokens and debug metadata.

At the same time:

- the Phaser game in [`frontend/js/app.js`](../../../frontend/js/app.js) still uses `pixelArt: true`
- the canvas in [`frontend/css/app.css`](../../../frontend/css/app.css) still uses `image-rendering: pixelated`

This means the text layer is still subject to the same pixel-art scaling chain as the stage itself. In practice, that limits the visual gain from font-size, weight, stroke, and spacing changes, especially for CJK text.

## Problem Statement

The readability problem is no longer best described as a typography-token problem alone. It is now a rendering-layer problem:

1. The scene needs pixel-art rendering.
2. The dialogue text does not benefit from pixel-art rendering.
3. Keeping both on the same canvas makes the text inherit the wrong rendering behavior.

The narrowest effective fix is therefore to split the bubble into:

- a Phaser visual shell layer
- a DOM text layer

## In Scope

- DOM rendering for character-head bubble text only
- Bubble text positioning driven by the existing hero-follow logic
- A dedicated overlay root above the game canvas
- Cross-platform typography rules for the DOM text layer
- Regression-visible debug state for the DOM text layer
- Automated regression coverage for mixed-language and wrapped dialogue content

## Out of Scope

- Bottom status board text
- Tools drawer text
- Memo panel text
- Global typography refactors
- Replacing the bubble body or tail with DOM
- Reworking character animation, scene timing, or state flow
- Replacing Phaser stage rendering with DOM

## Design Requirements

### 1. Preserve the existing bubble component identity

The resulting bubble must still look and behave like the current Liangshan dialogue bubble. The bottom shell, tail, timing, and follow target should remain the same component in user perception.

This means:

- bubble lifetime still follows the existing timer behavior
- bubble ownership still follows the same hero/speaker selection path
- bubble tail and body remain rendered by Phaser
- only the text rendering layer changes technology

### 2. Split shell and text responsibilities cleanly

The implementation should make the rendering responsibilities explicit:

- Phaser layer: bubble shell, tail, depth, and anchor point
- DOM layer: text content, line wrapping, font stack, line height, and browser-native text sharpness

The text layer should no longer depend on Phaser text metrics for its final rendering quality.

### 3. Reuse the current anchor and follow logic

The minimum delivery should not invent a second positioning system. It should reuse the current hero-follow anchor information from [`frontend/js/app-ui-runtime.js`](../../../frontend/js/app-ui-runtime.js) and convert that world position into DOM coordinates relative to the current game canvas rectangle.

The text overlay should stay aligned when:

- the active hero changes
- the viewport resizes
- the canvas is scaled by CSS
- the bubble is shown, moved, and hidden during normal runtime

### 4. Keep the DOM layer narrow and self-contained

The DOM text overlay should be mounted inside a dedicated overlay root attached to the game container, not scattered through unrelated UI chrome.

The overlay root should:

- sit above the canvas visually
- ignore pointer events
- only exist to host the active bubble text node
- be updated and cleared through the same bubble lifecycle used by the Phaser shell

### 5. Improve readability through browser-native text rendering

The DOM text layer should explicitly target readability:

- platform-aware font family stacks for Windows and macOS
- line height and max width tuned for CJK and mixed-language text
- stable dark-on-light contrast
- no decorative glow or blur compensation

The text should feel sharper and calmer than the current canvas text while still fitting the scene tone.

### 6. Preserve visual coherence between shell and text

Moving the text to DOM must not make the bubble feel detached from the stage. The text block should visually sit inside the existing shell with correct padding, centering, and wrapping.

If needed, the bubble shell may become slightly wider or taller to keep the text comfortably contained, but the visual direction must remain the same.

### 7. Keep regression support first-class

Because this is now a rendering-layer change, the implementation must expose enough debug metadata to validate the DOM text layer during regression. The debug surface should cover at least:

- active rendering mode for the bubble text layer
- active platform preset
- text content
- DOM overlay existence/visibility
- measured layout values needed to detect clipping or desync

The regression harness should assert:

- mixed Chinese-English text renders through the DOM text layer
- wrapped multi-line text stays readable and unclipped
- at least one non-idle bubble path uses the same DOM text layer
- the overlay remains aligned with the current bubble anchor

## Recommended Approach

Use a hybrid bubble implementation:

- keep the existing Phaser shell
- replace only the text node with a DOM overlay element anchored to the same hero position

This is recommended because it is the narrowest change that directly addresses the rendering-layer root cause without redesigning the bubble component or destabilizing the broader stage system.

## Rejected Alternatives

### 1. Keep tuning Phaser text tokens

Rejected because the current evidence shows the visual improvement plateaus once the text still lives inside a pixel-art canvas pipeline.

### 2. Replace the entire bubble with DOM

Rejected for the minimum delivery because it broadens scope into shell visuals, tail drawing, depth behavior, and full-component restyling.

### 3. Loosen global canvas pixel rendering rules

Rejected because the stage itself benefits from the current pixel-art treatment. Changing the global canvas chain risks degrading the broader visual language to rescue one text layer.

## Acceptance Criteria

The minimum delivery is complete when all of the following are true:

1. Bubble text is visibly sharper than the current canvas text on Windows and macOS Chromium-based browsers.
2. The bubble shell and tail still look like the same Liangshan component.
3. Mixed Chinese-English lines render through the DOM text layer and remain balanced.
4. Wrapped multi-line content remains readable without clipping or overflow.
5. Bubble follow behavior remains aligned during normal hero movement and scene transitions.
6. Automated regression checks can distinguish the DOM text mode from the old canvas-text mode.

## Validation Plan

Minimum validation should include:

- a Windows regression run with screenshots
- a macOS regression run with screenshots
- a mixed-language visible bubble case
- a forced wrapped multi-line bubble case
- an idle bubble case
- a non-idle bubble case
- a debug assertion that the text layer is using DOM mode

Suggested representative lines:

- `堂前消息已送達，請兄長過目。`
- `Review package is ready.`
- `堂前消息已送達，review package is ready.`
- `堂前消息已送達，review package is ready，請立即核對 attachments 與 follow-up notes。`

## Risks and Guardrails

### Risk: DOM text drifts away from the Phaser shell

Guardrail:
Use one anchor source of truth from the existing hero-follow path and expose alignment debug data for regression.

### Risk: DOM text looks too modern compared with the scene

Guardrail:
Keep the shell unchanged and constrain the DOM typography to sober, high-legibility settings that still fit the current tone.

### Risk: viewport scaling creates desync between shell and text

Guardrail:
Compute DOM coordinates from the live canvas bounding rectangle rather than assuming a fixed pixel ratio.

## Implementation Boundary for the Next Step

The planning phase should assume the work is centered on:

- [`frontend/js/app-ui-runtime.js`](../../../frontend/js/app-ui-runtime.js)
- [`frontend/js/app.js`](../../../frontend/js/app.js)
- [`frontend/css/app.css`](../../../frontend/css/app.css)
- [`frontend_regression_check.js`](../../../frontend_regression_check.js)

It should not expand into unrelated text systems or scene architecture unless verification proves the bubble shell itself must change.
