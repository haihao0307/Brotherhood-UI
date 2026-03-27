# Dialogue Bubble Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the readability of character-head dialogue bubbles on Windows and macOS without changing the bubble component model or expanding into a site-wide typography refactor.

**Architecture:** Keep the current Phaser bubble rendering path intact and localize the work to the bubble text layer. First expose bubble typography metadata through the existing debug surface, then replace the current hard-coded bubble text values with readability-oriented tokens plus small platform-aware overrides, and finally verify the result with regression screenshots and cross-platform review.

**Tech Stack:** Phaser 3, browser canvas text, vanilla JavaScript, Playwright-based regression script, Python control runtime

---

## File Structure

- Modify: `frontend/js/app-ui-runtime.js`
  Central bubble rendering path. This is where the new bubble text preset helpers, platform detection, text-style metadata, and updated `showBubble()` configuration will live.
- Modify: `frontend/js/app.js`
  Existing debug API surface. This will expose bubble typography metadata through `window.StarOfficeApp.getDebugState()` so regression checks can assert the active preset without scraping pixels.
- Modify: `frontend_regression_check.js`
  Existing Playwright regression harness. This will gain explicit assertions for bubble debug metadata and the readability preset values while continuing to capture screenshots for manual review.
- Use: `output/web-game/regression/`
  Existing screenshot artifact directory produced by the regression harness and used for manual before/after inspection.

## Constraints

- Do not replace the Phaser bubble with a DOM overlay.
- Do not touch the bottom status board, tools drawer, or memo typography.
- Do not change bubble shape, tail, duration logic, depth, or follow positioning.
- Slightly roomier wrapping, padding, or max width is allowed if that improves readability without changing the component identity.
- Do not change global canvas settings (`pixelArt`, `image-rendering`) in this plan unless the readability preset still fails acceptance after Task 2. This plan assumes the typography-first path is sufficient.

### Task 1: Expose Bubble Typography Metadata For Regression

**Files:**
- Modify: `frontend/js/app-ui-runtime.js`
- Modify: `frontend/js/app.js`
- Modify: `frontend_regression_check.js`
- Test: `output/web-game/regression/02-seeded-songjiang-event.png`

- [ ] **Step 1: Write the failing regression assertion**

Update `frontend_regression_check.js` so the seeded main-hero bubble must expose debug metadata. Add the helper near the other assertion helpers and call it immediately after the seeded Song Jiang idle-event checkpoint:

```js
function assertBubbleDebugMetadata(state, label) {
  if (!state || !state.bubbleDebug || !state.bubbleDebug.textStyle) {
    throw new Error(`${label}: bubble debug metadata missing`);
  }
}
```

```js
const seededEvent = await waitForState(
  page,
  'initial songjiang idle event',
  (state) =>
    state.scenePhase === 'main_idle' &&
    state.dialogueMode === 'idle_event' &&
    state.bubbleVisible &&
    state.bubbleHeroId === 'songjiang',
  Math.max(args.timeoutMs, 9000)
);
assertBubbleDebugMetadata(seededEvent, 'seeded_songjiang_event');
```

- [ ] **Step 2: Run the regression to verify it fails**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: FAIL with an error message containing:

```text
seeded_songjiang_event: bubble debug metadata missing
```

- [ ] **Step 3: Write the minimal implementation to surface bubble metadata**

In `frontend/js/app-ui-runtime.js`, capture the current bubble text values in a plain object before creating the Phaser text node, and store that object on `appState.bubble`:

```js
const bubbleTextStyle = {
  platformPreset: 'legacy',
  fontFamily: '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", "Source Han Sans TC", sans-serif',
  fontSize,
  fontWeight: 700,
  lineSpacing,
  stroke: '#fff4d0',
  strokeThickness: 1,
  padX,
  padY,
  maxW
};
```

```js
appState.bubble = {
  container: c,
  hideAt: scene.time.now + durationMs,
  speaker: speaker,
  heroId: opts.heroId || null,
  textStyle: bubbleTextStyle
};
```

In `frontend/js/app.js`, extend `window.StarOfficeApp.getDebugState()` to expose that metadata:

```js
bubbleDebug: appState.bubble ? {
  heroId: appState.bubble.heroId || null,
  speaker: appState.bubble.speaker || null,
  textStyle: appState.bubble.textStyle || null
} : null,
```

- [ ] **Step 4: Run the regression to verify it passes**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with JSON output containing `"ok": true` and refreshed screenshots under `output/web-game/regression/`.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/js/app-ui-runtime.js frontend/js/app.js frontend_regression_check.js
git commit -m "test: expose bubble typography debug metadata"
```

### Task 2: Replace Legacy Bubble Text Values With Readability Presets

**Files:**
- Modify: `frontend/js/app-ui-runtime.js`
- Modify: `frontend_regression_check.js`
- Test: `output/web-game/regression/02-seeded-songjiang-event.png`
- Test: `output/web-game/regression/06-idle-random-event.png`

- [ ] **Step 1: Tighten the regression with the new readability requirements**

Replace the metadata-only assertion with a real preset assertion in `frontend_regression_check.js`, and run it against both the seeded Song Jiang bubble and a support-hero idle-event bubble:

```js
function assertBubbleReadabilityPreset(state, label) {
  assertBubbleDebugMetadata(state, label);
  const style = state.bubbleDebug.textStyle;
  if (style.fontSize < 19) {
    throw new Error(`${label}: fontSize still too small (${style.fontSize})`);
  }
  if (style.strokeThickness !== 0) {
    throw new Error(`${label}: strokeThickness should be 0, got ${style.strokeThickness}`);
  }
  if (style.lineSpacing < 6) {
    throw new Error(`${label}: lineSpacing too tight (${style.lineSpacing})`);
  }
  if (style.padX < 16 || style.padY < 12) {
    throw new Error(`${label}: bubble padding too tight (${style.padX}x${style.padY})`);
  }
  if (style.maxW < 440) {
    throw new Error(`${label}: bubble max width too narrow (${style.maxW})`);
  }
  if (!['windows', 'macos', 'default'].includes(style.platformPreset)) {
    throw new Error(`${label}: unexpected bubble platform preset ${style.platformPreset}`);
  }
}
```

```js
assertBubbleReadabilityPreset(seededEvent, 'seeded_songjiang_event');
assertBubbleReadabilityPreset(idleInterruptEvent, 'idle_interrupt_source');
```

- [ ] **Step 2: Run the regression to verify it fails on the legacy bubble style**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: FAIL with at least one message like:

```text
seeded_songjiang_event: fontSize still too small (18)
```

- [ ] **Step 3: Implement the bubble readability preset helpers**

Refactor `frontend/js/app-ui-runtime.js` so `showBubble()` pulls from explicit preset helpers instead of hard-coded inline values.

Add a small platform detector:

```js
function detectBubblePlatform(win) {
  const nav = win && win.navigator ? win.navigator : {};
  const raw = String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || '').toLowerCase();
  if (raw.includes('mac')) return 'macos';
  if (raw.includes('win')) return 'windows';
  return 'default';
}
```

Add a readability preset helper:

```js
function getBubbleTextStyle(win) {
  const platformPreset = detectBubblePlatform(win);
  const base = {
    platformPreset,
    fontFamily: '"PingFang TC", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "Source Han Sans TC", sans-serif',
    fontSize: 19,
    fontWeight: 600,
    lineSpacing: 6,
    stroke: '#fff7e4',
    strokeThickness: 0,
    padX: 18,
    padY: 12,
    maxW: 448,
    color: '#17110b'
  };
  if (platformPreset === 'windows') {
    return {
      ...base,
      fontFamily: '"Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Source Han Sans TC", sans-serif',
      fontSize: 20,
      lineSpacing: 7
    };
  }
  if (platformPreset === 'macos') {
    return {
      ...base,
      fontFamily: '"PingFang TC", "SF Pro Text", "Noto Sans TC", "Source Han Sans TC", sans-serif'
    };
  }
  return base;
}
```

Then use that style inside `showBubble()`:

```js
const bubbleTextStyle = getBubbleTextStyle(window);

const txt = scene.add.text(0, 0, text, {
  fontFamily: bubbleTextStyle.fontFamily,
  fontSize: bubbleTextStyle.fontSize + 'px',
  fontStyle: String(bubbleTextStyle.fontWeight),
  color: bubbleTextStyle.color,
  stroke: bubbleTextStyle.stroke,
  strokeThickness: bubbleTextStyle.strokeThickness,
  lineSpacing: bubbleTextStyle.lineSpacing,
  wordWrap: { width: bubbleTextStyle.maxW, useAdvancedWrap: true }
}).setOrigin(0.5, 0.5);

const w = clamp(txt.width + bubbleTextStyle.padX * 2, 60, bubbleTextStyle.maxW + bubbleTextStyle.padX * 2);
const h = clamp(txt.height + bubbleTextStyle.padY * 2, 42, 156);
```

Keep the bubble body graphics, depth, duration, and follow behavior unchanged.

- [ ] **Step 4: Run the regression to verify it passes**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with `"ok": true`, plus fresh screenshots where the seeded Song Jiang bubble and the support-hero idle bubble both reflect the new preset.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/js/app-ui-runtime.js frontend_regression_check.js
git commit -m "feat: improve dialogue bubble readability"
```

### Task 3: Cross-Platform Visual Verification Before Merge

**Files:**
- Test: `output/web-game/regression/02-seeded-songjiang-event.png`
- Test: `output/web-game/regression/06-idle-random-event.png`

- [ ] **Step 1: Run the automated regression on the current machine**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with screenshots refreshed in `output/web-game/regression/`.

- [ ] **Step 2: Inspect the Windows or current-platform screenshots manually**

Open these artifacts:

```text
output/web-game/regression/02-seeded-songjiang-event.png
output/web-game/regression/06-idle-random-event.png
```

Confirm all of the following:

```text
- bubble text edges look cleaner than before
- Chinese text no longer looks obviously fuzzy
- mixed Chinese-English lines remain balanced
- bubble padding is not cramped
- bubble shape and placement still match the existing component
```

- [ ] **Step 3: Repeat the same regression on macOS before merge**

Run on a macOS checkout of the same branch:

```bash
python3 brotherhood_control_runtime.py regression
```

Open the same screenshot names and confirm the same checklist passes on macOS.

- [ ] **Step 4: Stop here if the preset still looks soft on one platform**

If either platform still fails the checklist after Task 2, do not change global canvas settings ad hoc. Write down which screenshot failed and return to design review to decide whether a second follow-up spec is needed for canvas-level rendering changes.
