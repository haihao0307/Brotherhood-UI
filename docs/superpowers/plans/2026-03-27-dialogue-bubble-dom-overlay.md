# Dialogue Bubble DOM Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the character-head dialogue bubble text with a DOM overlay layer while keeping the existing Phaser-rendered shell, tail, timing, and hero-follow behavior.

**Architecture:** Keep the bubble shell in Phaser and move only the text layer into a dedicated DOM overlay root mounted inside `#game-container`. Use the current bubble anchor from `app-ui-runtime.js` as the single source of truth, convert world coordinates to DOM coordinates relative to the live canvas rectangle, and expose DOM-mode bubble debug state so regression can assert rendering mode, text layout, and alignment.

**Tech Stack:** Phaser 3, vanilla JavaScript, DOM/CSS overlay positioning, Playwright-based regression script, Python control runtime

---

## File Structure

- Modify: `frontend/js/app-ui-runtime.js`
  Replace the current Phaser text node path with a hybrid shell-plus-DOM implementation, add overlay positioning helpers, and expose DOM-mode debug layout state.
- Modify: `frontend/js/app.js`
  Create the overlay root during boot, thread it through app state, and expose the new bubble debug fields and DOM mode through `window.StarOfficeApp.getDebugState()`.
- Modify: `frontend/css/app.css`
  Add the overlay root and bubble text styles so the DOM text layer sits above the canvas, ignores pointer events, and stays visually aligned with the existing shell.
- Modify: `frontend_regression_check.js`
  Fail first on the old canvas-text mode, then assert DOM mode, overlay visibility, mixed-language rendering, wrapped multi-line layout, and alignment-friendly debug values.
- Use: `output/web-game/regression/`
  Screenshot artifacts for manual Windows/macOS visual review after regression passes.

## Constraints

- Do not replace the bubble body or tail with DOM.
- Do not change the global pixel-art canvas settings in this plan.
- Do not modify bottom status-board, tools drawer, or memo text systems.
- Keep bubble lifetime, speaker selection, and hero-follow ownership on the existing path.
- The overlay root must stay inside `#game-container` and use `pointer-events: none`.

### Task 1: Make Regression Demand DOM Bubble Text

**Files:**
- Modify: `frontend_regression_check.js`
- Test: `output/web-game/regression/02-mixed-language-bubble.png`
- Test: `output/web-game/regression/03-wrapped-debug-bubble.png`

- [ ] **Step 1: Write the failing DOM-mode assertions**

Add a helper near the other bubble assertions in `frontend_regression_check.js`:

```js
function assertDomBubbleMode(state, label) {
  const bubble = state && state.bubbleDebug ? state.bubbleDebug : null;
  if (!bubble || bubble.renderMode !== 'dom') {
    throw new Error(`${label}: expected DOM bubble mode`);
  }
  if (!bubble.domVisible) {
    throw new Error(`${label}: expected visible DOM bubble node`);
  }
  if (typeof bubble.anchorX !== 'number' || typeof bubble.anchorY !== 'number') {
    throw new Error(`${label}: missing DOM bubble anchor coordinates`);
  }
}
```

Call it for:

- the mixed-language debug bubble
- the wrapped debug bubble
- the writing handoff bubble

Example:

```js
assertDomBubbleMode(mixedBubbleState, 'mixed_language_bubble');
assertBubbleContainsText(mixedBubbleState, 'mixed_language_bubble', 'review package is ready');
```

- [ ] **Step 2: Run the regression to verify it fails on the current canvas-text implementation**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: FAIL with a message containing:

```text
mixed_language_bubble: expected DOM bubble mode
```

- [ ] **Step 3: Tighten the wrapped-layout expectations while still red**

Extend `assertBubbleWrapsWithoutClipping()` so it also expects DOM overlay layout fields:

```js
if (typeof state.bubbleDebug.domLeft !== 'number' || typeof state.bubbleDebug.domTop !== 'number') {
  throw new Error(`${label}: missing DOM overlay position`);
}
if (typeof state.bubbleDebug.domWidth !== 'number' || typeof state.bubbleDebug.domHeight !== 'number') {
  throw new Error(`${label}: missing DOM overlay size`);
}
```

Do not make any production changes yet.

- [ ] **Step 4: Re-run the regression and confirm it still fails for the new DOM fields**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: FAIL with the same DOM-mode gap or a missing DOM field error.

- [ ] **Step 5: Commit the red test-only state**

Run:

```bash
git add frontend_regression_check.js
git commit -m "test: require DOM bubble text mode"
```

### Task 2: Add Overlay Root And DOM Bubble Lifecycle

**Files:**
- Modify: `frontend/js/app-ui-runtime.js`
- Modify: `frontend/js/app.js`
- Modify: `frontend/css/app.css`
- Test: `output/web-game/regression/02-mixed-language-bubble.png`

- [ ] **Step 1: Implement the minimal overlay root plumbing**

In `frontend/js/app.js`, add a helper before `init()` that creates one overlay root inside `#game-container`:

```js
function ensureBubbleOverlayRoot() {
  const host = document.getElementById('game-container');
  if (!host) return null;
  let root = host.querySelector('.bubble-text-overlay-root');
  if (root) return root;
  root = document.createElement('div');
  root.className = 'bubble-text-overlay-root';
  host.appendChild(root);
  return root;
}
```

Store it on app state:

```js
bubbleOverlayRoot: null,
```

and initialize it before `new Phaser.Game(config);`:

```js
appState.bubbleOverlayRoot = ensureBubbleOverlayRoot();
```

- [ ] **Step 2: Replace the Phaser text node with a DOM text element**

In `frontend/js/app-ui-runtime.js`, change `showBubble()` so it:

- still creates the Phaser graphics shell
- does not create `scene.add.text(...)`
- creates a DOM element inside `appState.bubbleOverlayRoot`

Use this shape:

```js
const domNode = document.createElement('div');
domNode.className = 'bubble-text-overlay';
domNode.textContent = String(text || '');
domNode.setAttribute('data-platform-preset', bubbleTextStyle.platformPreset);
appState.bubbleOverlayRoot.appendChild(domNode);
```

Store it on `appState.bubble`:

```js
appState.bubble = {
  container: c,
  domNode,
  hideAt: scene.time.now + durationMs,
  speaker,
  heroId: opts.heroId || null,
  textStyle: bubbleTextStyle
};
```

- [ ] **Step 3: Give the DOM node real typography and containment styles**

In `frontend/css/app.css`, add:

```css
.bubble-text-overlay-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
  z-index: 20;
}

.bubble-text-overlay {
  position: absolute;
  left: 0;
  top: 0;
  max-width: 448px;
  padding: 0;
  color: #17110b;
  font-weight: 600;
  line-height: 1.45;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  text-align: center;
  transform: translate(-50%, -50%);
}

.bubble-text-overlay[data-platform-preset='windows'] {
  font-family: "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Source Han Sans TC", sans-serif;
  font-size: 20px;
}

.bubble-text-overlay[data-platform-preset='macos'] {
  font-family: "PingFang TC", "SF Pro Text", "Noto Sans TC", "Source Han Sans TC", sans-serif;
  font-size: 19px;
}

.bubble-text-overlay[data-platform-preset='default'] {
  font-family: "PingFang TC", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "Source Han Sans TC", sans-serif;
  font-size: 19px;
}
```

Also make `#game-container` a positioning host if it is not already:

```css
#game-container {
  position: relative;
}
```

- [ ] **Step 4: Run the regression to verify the DOM-mode assertions now pass and identify the next failing gap**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: The previous `expected DOM bubble mode` failure is gone. If another failure appears, it should now point to missing DOM position/layout debug fields rather than old canvas text mode.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/js/app-ui-runtime.js frontend/js/app.js frontend/css/app.css
git commit -m "feat: add DOM bubble text overlay root"
```

### Task 3: Sync DOM Position To The Existing Bubble Anchor

**Files:**
- Modify: `frontend/js/app-ui-runtime.js`
- Modify: `frontend/js/app.js`
- Test: `output/web-game/regression/03-wrapped-debug-bubble.png`
- Test: `output/web-game/regression/06-writing-handoff.png`

- [ ] **Step 1: Add a canvas-to-DOM coordinate helper**

In `frontend/js/app-ui-runtime.js`, add:

```js
function getBubbleDomPosition(appState, hero) {
  const canvas = appState.sceneRef && appState.sceneRef.game ? appState.sceneRef.game.canvas : null;
  if (!canvas || !hero) return null;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / appState.sceneRef.scale.width;
  const scaleY = rect.height / appState.sceneRef.scale.height;
  const anchorX = hero.x;
  const anchorY = hero.y - hero.displayHeight - 18;
  return {
    anchorX,
    anchorY,
    domLeft: anchorX * scaleX,
    domTop: anchorY * scaleY,
    scaleX,
    scaleY
  };
}
```

- [ ] **Step 2: Update the DOM node whenever the bubble moves**

Extend `updateBubblePos(appState)`:

```js
const pos = getBubbleDomPosition(appState, hero);
if (!pos) return;
bubble.container.x = pos.anchorX;
bubble.container.y = pos.anchorY;
if (bubble.domNode) {
  bubble.domNode.style.left = pos.domLeft + 'px';
  bubble.domNode.style.top = pos.domTop + 'px';
}
bubble.debugLayout = {
  ...(bubble.debugLayout || {}),
  anchorX: pos.anchorX,
  anchorY: pos.anchorY,
  domLeft: pos.domLeft,
  domTop: pos.domTop
};
```

Call `updateBubblePos(appState)` from the same places it already runs so the DOM node follows the hero automatically.

- [ ] **Step 3: Cleanly destroy the DOM node with the bubble**

Extend `clearCurrentBubble(appState)`:

```js
if (appState.bubble && appState.bubble.domNode && appState.bubble.domNode.parentNode) {
  appState.bubble.domNode.parentNode.removeChild(appState.bubble.domNode);
}
```

Keep the existing Phaser shell destroy path intact.

- [ ] **Step 4: Expose the new DOM anchor fields in debug state**

In `frontend/js/app.js`, extend `bubbleDebug`:

```js
renderMode: appState.bubble && appState.bubble.domNode ? 'dom' : 'canvas',
domVisible: !!(appState.bubble && appState.bubble.domNode),
anchorX: appState.bubble && appState.bubble.debugLayout ? Number(appState.bubble.debugLayout.anchorX || 0) : 0,
anchorY: appState.bubble && appState.bubble.debugLayout ? Number(appState.bubble.debugLayout.anchorY || 0) : 0,
domLeft: appState.bubble && appState.bubble.debugLayout ? Number(appState.bubble.debugLayout.domLeft || 0) : 0,
domTop: appState.bubble && appState.bubble.debugLayout ? Number(appState.bubble.debugLayout.domTop || 0) : 0,
```

- [ ] **Step 5: Run the regression to verify the wrapped and writing-handoff cases are green**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with `"ok": true`, and the DOM-mode checkpoints should show `renderMode: "dom"` plus non-zero `domLeft` / `domTop`.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/js/app-ui-runtime.js frontend/js/app.js
git commit -m "feat: sync DOM bubble text to hero anchor"
```

### Task 4: Align The Shell To The DOM Text Box And Verify No Clipping

**Files:**
- Modify: `frontend/js/app-ui-runtime.js`
- Modify: `frontend/css/app.css`
- Modify: `frontend_regression_check.js`
- Test: `output/web-game/regression/02-mixed-language-bubble.png`
- Test: `output/web-game/regression/03-wrapped-debug-bubble.png`
- Test: `output/web-game/regression/08-idle-random-event.png`

- [ ] **Step 1: Measure the DOM text box instead of Phaser text metrics**

After appending the DOM node in `showBubble()`, measure it:

```js
const rect = domNode.getBoundingClientRect();
const textWidth = Math.ceil(rect.width);
const textHeight = Math.ceil(rect.height);
const w = clamp(textWidth + bubbleTextStyle.padX * 2, 60, bubbleTextStyle.maxW + bubbleTextStyle.padX * 2);
const h = Math.max(42, textHeight + bubbleTextStyle.padY * 2);
```

Then draw the Phaser shell from `w` and `h`.

- [ ] **Step 2: Center the DOM text inside the shell**

Update the DOM styles so the text sits visually inside the bubble body:

```css
.bubble-text-overlay {
  padding: 12px 18px;
  border-radius: 6px;
}
```

Then offset the node so the shell tail stays visually attached under the bubble body:

```js
bubble.domNode.style.transform = 'translate(-50%, calc(-100% + 24px))';
```

Use one consistent transform rather than mixing multiple offsets in different places.

- [ ] **Step 3: Refresh the debug layout with measured DOM dimensions**

Store:

```js
bubble.debugLayout = {
  ...(bubble.debugLayout || {}),
  text: String(text || ''),
  bubbleWidth: w,
  bubbleHeight: h,
  textWidth,
  textHeight,
  lineCount: domNode.textContent ? Math.max(1, domNode.getClientRects().length) : 1,
  textFits: textWidth <= (w - bubbleTextStyle.padX * 2) && textHeight <= (h - bubbleTextStyle.padY * 2)
};
```

The exact line-count logic may differ, but the final fields must support the wrapped no-clipping regression.

- [ ] **Step 4: Run the full regression and confirm the DOM layout path stays green**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with `"ok": true`. The wrapped checkpoint should report `renderMode: "dom"` and `textFits: true`.

- [ ] **Step 5: Manually inspect the Windows/current-platform screenshots**

Open:

```text
output/web-game/regression/02-mixed-language-bubble.png
output/web-game/regression/03-wrapped-debug-bubble.png
output/web-game/regression/06-writing-handoff.png
output/web-game/regression/08-idle-random-event.png
```

Confirm:

```text
- the text looks noticeably sharper than the old canvas text
- the shell still feels like the same component
- mixed-language text remains balanced
- wrapped text does not clip
- the text remains visually centered inside the shell
```

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/js/app-ui-runtime.js frontend/css/app.css frontend_regression_check.js
git commit -m "feat: align bubble shell to DOM text overlay"
```

### Task 5: Cross-Platform Verification Before Merge

**Files:**
- Test: `output/web-game/regression/02-mixed-language-bubble.png`
- Test: `output/web-game/regression/03-wrapped-debug-bubble.png`
- Test: `output/web-game/regression/06-writing-handoff.png`
- Test: `output/web-game/regression/08-idle-random-event.png`

- [ ] **Step 1: Re-run regression on the current machine**

Run:

```bash
python brotherhood_control_runtime.py regression
```

Expected: PASS with `"ok": true`.

- [ ] **Step 2: Run the same regression on macOS before merge**

Run on a macOS checkout of the same branch:

```bash
python3 brotherhood_control_runtime.py regression
```

Expected: PASS with `"ok": true`.

- [ ] **Step 3: Review the same screenshots on macOS**

Inspect:

```text
output/web-game/regression/02-mixed-language-bubble.png
output/web-game/regression/03-wrapped-debug-bubble.png
output/web-game/regression/06-writing-handoff.png
output/web-game/regression/08-idle-random-event.png
```

Confirm the same readability and alignment checklist passes on macOS.

- [ ] **Step 4: Stop and return to design if DOM text still desyncs**

If either platform shows visible shell/text misalignment after the DOM overlay is in place, do not patch around it ad hoc. Capture the failing screenshot names and return to design review for a follow-up on shell-anchor synchronization.
