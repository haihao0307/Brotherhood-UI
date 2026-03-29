const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadUiRuntime(extraWindow) {
  const windowOverrides = extraWindow || {};
  const context = {
    window: {
      navigator: {},
      ...windowOverrides.window,
    },
    document: windowOverrides.document || {},
    console,
    Math: windowOverrides.Math || Math,
    Number: windowOverrides.Number || Number,
    String: windowOverrides.String || String,
    Array: windowOverrides.Array || Array,
    Object: windowOverrides.Object || Object,
    Set: windowOverrides.Set || Set,
    parseFloat,
  };
  context.window.window = context.window;
  context.window.document = context.document;
  context.window.getComputedStyle = windowOverrides.getComputedStyle || (() => ({
    lineHeight: '29px',
    paddingLeft: '18px',
    paddingRight: '18px',
    paddingTop: '12px',
    paddingBottom: '12px',
  }));
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'app-ui-runtime.js'),
    'utf8'
  );
  vm.runInNewContext(source, context, { filename: 'app-ui-runtime.js' });
  return context.window.BrotherhoodAppUi;
}

test('bubble measurement caps width to the visible viewport budget', () => {
  const ui = loadUiRuntime();

  const widthPx = ui.getBubbleMeasurementMaxWidthPx({
    viewportWidthPx: 320,
    sceneWidthPx: 320,
    requestedMaxWidthPx: 448,
    marginPx: 8,
  });

  assert.equal(widthPx, 304);
});

test('bubble scene size uses measured box size without reapplying padding', () => {
  const ui = loadUiRuntime();

  const metrics = ui.resolveBubbleSceneMetrics({
    boxWidthPx: 220,
    boxHeightPx: 80,
    scaleX: 1,
    scaleY: 1,
    minWidthScene: 60,
    minHeightScene: 42,
  });

  assert.equal(metrics.bubbleWidthScene, 220);
  assert.equal(metrics.bubbleHeightScene, 80);
});

test('bubble placement clamps back into view when the speaker is near the left edge', () => {
  const ui = loadUiRuntime();

  const layout = ui.computeBubblePlacement({
    anchorX: 40,
    anchorY: 420,
    bubbleWidth: 220,
    bubbleHeight: 80,
    sceneWidth: 1280,
    sceneHeight: 720,
    margin: 8,
    tailHeight: 12,
    tailInset: 18,
  });

  assert.equal(layout.bubbleLeft, 8);
  assert.equal(layout.bubbleTop, 328);
  assert.ok(layout.tailTipX >= 26);
  assert.ok(layout.tailTipX <= 202);
});
