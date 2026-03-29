# Dialogue Bubble Adaptive Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dialogue bubbles stay visible longer based on actual reading load so short lines are only slightly slower while long lines remain on screen noticeably longer.

**Architecture:** Keep the current scheduler model and bubble rendering path unchanged, but centralize dialogue duration calculation in `app-dialogue-runtime.js`. Route main-loop, support-loop, and idle-random-event bubble durations through the shared helper so timing behavior is consistent and easy to tune.

**Tech Stack:** Vanilla JavaScript, browser-loaded runtime modules, Node built-in test runner, Playwright-based frontend regression, Python control runtime

---

## File Structure

- Create: `tests/frontend/test_dialogue_duration.test.js`
  Minimal Node-based unit coverage for the new shared duration helper and the scheduler integration points.
- Modify: `frontend/js/app-dialogue-runtime.js`
  Add the shared adaptive duration helper and export it on `window.BrotherhoodDialogueRuntime`.
- Modify: `frontend/js/app-dialogue-scheduler.js`
  Replace duplicated hard-coded duration formulas in the main/support loop paths and merge the helper into idle random event duration resolution.
- Use: `frontend_regression_check.js`
  Existing end-to-end frontend coverage that should continue to pass after the timing behavior changes.

## Constraints

- Do not change dialogue selection, hero routing, or scene switching logic.
- Do not change bubble rendering, DOM overlay behavior, or layout metrics.
- Do not change handoff status-bubble timing in `app-status-runtime.js`.
- Idle random events with explicit `durationMs` must keep that value when it is already longer than the computed readability duration.
- Keep the adaptive logic centralized in one helper instead of reintroducing inline formulas.

### Task 1: Add A Failing Unit Test For Adaptive Dialogue Duration

**Files:**
- Create: `tests/frontend/test_dialogue_duration.test.js`
- Test: `tests/frontend/test_dialogue_duration.test.js`

- [ ] **Step 1: Write the failing duration-helper test**

Create `tests/frontend/test_dialogue_duration.test.js` with a browser-script loader and the first set of failing assertions:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDialogueRuntime() {
  const context = {
    window: {},
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
  };
  context.window = context;
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'app-dialogue-runtime.js'),
    'utf8'
  );
  vm.runInNewContext(source, context, { filename: 'app-dialogue-runtime.js' });
  return context.window.BrotherhoodDialogueRuntime;
}

test('adaptive bubble duration scales up for long lines and stays modest for short lines', () => {
  const runtime = loadDialogueRuntime();
  assert.equal(typeof runtime.getAdaptiveBubbleDurationMs, 'function');

  const shortMs = runtime.getAdaptiveBubbleDurationMs('收到。');
  const mediumMs = runtime.getAdaptiveBubbleDurationMs('堂前消息已送達，請開始核對。');
  const longMs = runtime.getAdaptiveBubbleDurationMs('堂前消息已送達，review package is ready，請立即核對 attachments 與 follow-up notes，確認多行換行後仍完整顯示。');

  assert.ok(shortMs >= 3200 && shortMs <= 3800);
  assert.ok(mediumMs > shortMs);
  assert.ok(longMs >= 8500);
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run:

```bash
node --test tests/frontend/test_dialogue_duration.test.js
```

Expected: FAIL because `getAdaptiveBubbleDurationMs` does not exist yet.

- [ ] **Step 3: Add a second failing test for scheduler integration expectations**

Append a second test in the same file:

```js
test('adaptive bubble duration rewards punctuation and line breaks', () => {
  const runtime = loadDialogueRuntime();
  const plainMs = runtime.getAdaptiveBubbleDurationMs('這裡是同樣長度的一句平直陳述');
  const punctuatedMs = runtime.getAdaptiveBubbleDurationMs('這裡是同樣長度的一句平直陳述，請立刻回看！');
  const multilineMs = runtime.getAdaptiveBubbleDurationMs('第一行先報到。\n第二行再補一句。');

  assert.ok(punctuatedMs > plainMs);
  assert.ok(multilineMs > plainMs);
});
```

Do not implement production code yet.

- [ ] **Step 4: Re-run the unit test and confirm it is still red**

Run:

```bash
node --test tests/frontend/test_dialogue_duration.test.js
```

Expected: FAIL for the missing helper or missing adaptive behavior.

- [ ] **Step 5: Commit the red test state**

Run:

```bash
git add tests/frontend/test_dialogue_duration.test.js
git commit -m "test: cover adaptive dialogue bubble duration"
```

### Task 2: Implement The Shared Adaptive Duration Helper

**Files:**
- Modify: `frontend/js/app-dialogue-runtime.js`
- Test: `tests/frontend/test_dialogue_duration.test.js`

- [ ] **Step 1: Add the minimal shared helper in dialogue runtime**

In `frontend/js/app-dialogue-runtime.js`, add a helper before the `window.BrotherhoodDialogueRuntime` export:

```js
function getAdaptiveBubbleDurationMs(text, options) {
  const opts = options || {};
  const value = String(text || '');
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\s+/g, ' ');
  const baseMs = Math.max(0, Number(opts.baseMs || 3000));
  const perCharMs = Math.max(0, Number(opts.perCharMs || 115));
  const punctuationBonusMs = Math.max(0, Number(opts.punctuationBonusMs || 140));
  const lineBreakBonusMs = Math.max(0, Number(opts.lineBreakBonusMs || 320));
  const minMs = Math.max(0, Number(opts.minMs || 3200));
  const maxMs = Math.max(minMs, Number(opts.maxMs || 9000));
  const punctuationCount = (normalized.match(/[，。！？、；：,.!?;:]/g) || []).length;
  const lineBreakCount = (trimmed.match(/\n/g) || []).length;
  const effectiveLength = normalized.length;
  const durationMs = baseMs +
    (effectiveLength * perCharMs) +
    (punctuationCount * punctuationBonusMs) +
    (lineBreakCount * lineBreakBonusMs);
  return clamp(Math.round(durationMs), minMs, maxMs);
}
```

- [ ] **Step 2: Export the helper**

Extend the runtime export object:

```js
window.BrotherhoodDialogueRuntime = {
  extractDialogueLines,
  getDialogueSelectionConfig,
  getHandoffDialogueConfig,
  getHeroDialogueNode,
  getHeroDialogueLoopConfig,
  getIdleRandomEventConfig,
  pickDialogueEntry,
  randBetween,
  getAdaptiveBubbleDurationMs
};
```

- [ ] **Step 3: Run the unit test to verify it passes**

Run:

```bash
node --test tests/frontend/test_dialogue_duration.test.js
```

Expected: PASS with both adaptive-duration tests green.

- [ ] **Step 4: Refactor only if the green implementation duplicates parsing logic**

If needed, extract tiny helpers for punctuation counting or whitespace normalization, but keep everything in `frontend/js/app-dialogue-runtime.js` and do not change behavior.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/js/app-dialogue-runtime.js tests/frontend/test_dialogue_duration.test.js
git commit -m "feat: add adaptive dialogue bubble duration helper"
```

### Task 3: Route Scheduler Bubble Timing Through The Shared Helper

**Files:**
- Modify: `frontend/js/app.js`
- Modify: `frontend/js/app-dialogue-scheduler.js`
- Test: `tests/frontend/test_dialogue_duration.test.js`
- Test: `frontend_regression_check.js`

- [ ] **Step 1: Write a failing scheduler test that proves hard-coded formulas are gone**

Extend `tests/frontend/test_dialogue_duration.test.js` with a scheduler integration test that stubs `showBubble` and asserts the helper output is used:

```js
function loadDialogueScheduler(extraWindow) {
  const context = {
    window: {
      BrotherhoodDialogueScheduler: {},
      ...extraWindow,
    },
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Date,
    setTimeout: (fn) => ({ fn }),
    clearTimeout: () => {},
  };
  context.window = context.window;
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'app-dialogue-scheduler.js'),
    'utf8'
  );
  vm.runInNewContext(source, context, { filename: 'app-dialogue-scheduler.js' });
  return context.window.BrotherhoodDialogueScheduler;
}

test('main dialogue loop uses adaptive bubble duration helper', () => {
  const runtime = loadDialogueRuntime();
  const scheduler = loadDialogueScheduler();
  const line = '堂前消息已送達，請立即核對 attachments 與 follow-up notes。';
  let capturedDurationMs = null;

  const appState = {
    currentState: 'writing',
    mainDialogueTimerId: null,
    lastSupportDialogueAt: 0,
  };
  const deps = {
    randBetween: () => 0,
    isHeroMoving: () => false,
    pickDialogueEntry: () => ({ text: line }),
    showBubble: (_, __, options) => { capturedDurationMs = options.durationMs; },
    getAdaptiveBubbleDurationMs: runtime.getAdaptiveBubbleDurationMs,
  };

  scheduler.scheduleNextMainDialogue(appState, 'writing', {
    entries: [{ text: line }],
    firstDelayMinMs: 0,
    firstDelayMaxMs: 0,
    intervalMinMs: 0,
    intervalMaxMs: 0,
    minGapAfterSupportMs: 0,
    dialogueKey: 'songjiang:writing',
  }, deps, { first: true });

  appState.mainDialogueTimerId.fn();
  assert.equal(capturedDurationMs, runtime.getAdaptiveBubbleDurationMs(line));
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run:

```bash
node --test tests/frontend/test_dialogue_duration.test.js
```

Expected: FAIL because the scheduler still uses the old inline `Math.max(2600, Math.min(5200, line.length * 180))` formula.

- [ ] **Step 3: Thread the helper through scheduler dependencies**

In `frontend/js/app.js`, extend `getDialogueSchedulerDeps()`:

```js
function getAdaptiveBubbleDurationMs(text, options) {
  if (typeof dialogueRuntime.getAdaptiveBubbleDurationMs === 'function') {
    return dialogueRuntime.getAdaptiveBubbleDurationMs(text, options);
  }
  return Math.max(2600, Math.min(5200, String(text || '').length * 180));
}
```

```js
return {
  getEffectiveWorkflowState,
  resolveScenePhase,
  resolveDialogueMode,
  getIdleRandomEventConfig,
  getHeroDialogueLoopConfig,
  pickDialogueEntry,
  randBetween,
  getAdaptiveBubbleDurationMs,
  showBubble: uiApi.showBubble,
  clearCurrentBubble: uiApi.clearCurrentBubble,
  isHeroMoving
};
```

- [ ] **Step 4: Replace the hard-coded scheduler formulas with the shared helper**

In `frontend/js/app-dialogue-scheduler.js`, update the main and support loop calls:

```js
const durationMs = deps.getAdaptiveBubbleDurationMs(line);
deps.showBubble(appState, line, {
  speaker: 'main',
  durationMs
});
```

and:

```js
const durationMs = deps.getAdaptiveBubbleDurationMs(line);
deps.showBubble(appState, line, {
  speaker: 'support',
  durationMs
});
```

Also update idle random event duration resolution:

```js
const computedDurationMs = deps.getAdaptiveBubbleDurationMs(event.text);
const durationMs = Math.max(
  1800,
  Number(event.durationMs || 0),
  Number(cfg.bubbleDurationMs || 0),
  computedDurationMs
);
```

Use the existing highlight logic after `durationMs` is resolved.

- [ ] **Step 5: Re-run the unit test to verify it passes**

Run:

```bash
node --test tests/frontend/test_dialogue_duration.test.js
```

Expected: PASS with the scheduler integration test green.

- [ ] **Step 6: Run the frontend regression to verify behavior still works end-to-end**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with `"ok": true` and refreshed screenshots in `output/web-game/regression/`.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/js/app.js frontend/js/app-dialogue-scheduler.js tests/frontend/test_dialogue_duration.test.js
git commit -m "feat: apply adaptive dialogue bubble timing"
```

### Task 4: Final Verification And Review

**Files:**
- Test: `tests/frontend/test_dialogue_duration.test.js`
- Test: `frontend_regression_check.js`
- Test: `output/web-game/regression/`

- [ ] **Step 1: Re-run the focused unit coverage**

Run:

```bash
node --test tests/frontend/test_dialogue_duration.test.js
```

Expected: PASS.

- [ ] **Step 2: Re-run the full frontend regression**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with `"ok": true`.

- [ ] **Step 3: Inspect the latest regression screenshots for cadence sanity**

Open and review:

```text
output/web-game/regression/04-seeded-songjiang-event.png
output/web-game/regression/06-writing-handoff.png
output/web-game/regression/08-idle-random-event.png
```

Confirm:

```text
- short lines do not feel stalled
- long lines no longer feel prematurely cut off
- bubble layout and rendering are unchanged
- handoff and idle-event flows still look rhythmically plausible
```

- [ ] **Step 4: Stop and revisit tuning if long bubbles drag scene cadence too much**

If the regression screenshots or manual playback show that long lines now linger awkwardly, adjust only the helper constants in `app-dialogue-runtime.js`. Do not add per-call special cases unless a new design review explicitly approves that complexity.
