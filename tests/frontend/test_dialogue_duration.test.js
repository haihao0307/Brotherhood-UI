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

function loadDialogueScheduler(extraWindow) {
  const windowOverrides = extraWindow || {};
  const context = {
    window: {
      BrotherhoodDialogueScheduler: {},
      ...windowOverrides.window,
    },
    console,
    Math: windowOverrides.Math || Math,
    Number: windowOverrides.Number || Number,
    String: windowOverrides.String || String,
    Array: windowOverrides.Array || Array,
    Object: windowOverrides.Object || Object,
    Set: windowOverrides.Set || Set,
    Date: windowOverrides.Date || Date,
    setTimeout: windowOverrides.setTimeout || ((fn) => ({ fn })),
    clearTimeout: windowOverrides.clearTimeout || (() => {}),
  };
  context.window = context.window;
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'app-dialogue-scheduler.js'),
    'utf8'
  );
  vm.runInNewContext(source, context, { filename: 'app-dialogue-scheduler.js' });
  return context.window.BrotherhoodDialogueScheduler;
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

test('adaptive bubble duration rewards punctuation and line breaks', () => {
  const runtime = loadDialogueRuntime();
  const plainMs = runtime.getAdaptiveBubbleDurationMs('這裡是同樣長度的一句平直陳述');
  const punctuatedMs = runtime.getAdaptiveBubbleDurationMs('這裡是同樣長度的一句平直陳述，請立刻回看！');
  const multilineMs = runtime.getAdaptiveBubbleDurationMs('第一行先報到。\n第二行再補一句。');

  assert.ok(punctuatedMs > plainMs);
  assert.ok(multilineMs > plainMs);
});

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
    showBubble: (_, __, options) => {
      capturedDurationMs = options.durationMs;
    },
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

test('idle random event preserves an explicit longer duration over computed timing', () => {
  const scheduler = loadDialogueScheduler();
  let capturedDurationMs = null;

  const appState = {
    activeIdleEventHeroId: null,
    lastIdleEventAtByHero: {},
    engine: null,
  };
  const cfg = {
    bubbleDurationMs: 3600,
  };
  const event = {
    id: 'idle-explicit-longer',
    heroId: 'songjiang',
    text: '收到。',
    durationMs: 6400,
  };
  const deps = {
    getAdaptiveBubbleDurationMs: () => 3200,
    showBubble: (_, __, options) => {
      capturedDurationMs = options.durationMs;
    },
  };

  scheduler.triggerIdleRandomEvent(appState, cfg, event, deps);

  assert.equal(capturedDurationMs, 6400);
});

test('seeded idle random event unlock timer matches the resolved shown duration', () => {
  const scheduledTimeouts = [];
  const scheduler = loadDialogueScheduler({
    Date: {
      now: () => 1000,
    },
    setTimeout: (fn, delayMs) => {
      const timer = { fn, delayMs };
      scheduledTimeouts.push(timer);
      return timer;
    },
    clearTimeout: () => {},
  });
  let capturedDurationMs = null;

  const appState = {
    dialogueMode: 'idle_event',
    bubble: null,
    engine: {},
    idleRandomEventTimerId: null,
    activeIdleEventHeroId: null,
    lastIdleEventAtByHero: {},
    lastIdleEventId: null,
    initialIdleRandomSeedPending: true,
    supportRoamingUnlocked: false,
    supportRoamingUnlockTimerId: null,
  };
  const cfg = {
    intervalMinMs: 0,
    intervalMaxMs: 0,
    cooldownPerHeroMs: 0,
    bubbleDurationMs: 3000,
    pool: [{
      id: 'seed-songjiang',
      heroId: 'songjiang',
      text: '收到。',
      durationMs: 2000,
      weight: 1,
    }],
  };
  const deps = {
    randBetween: () => 0,
    getAdaptiveBubbleDurationMs: () => 4700,
    showBubble: (_, __, options) => {
      capturedDurationMs = options.durationMs;
    },
  };

  scheduler.scheduleNextIdleRandomEvent(appState, cfg, deps, {
    delayMs: 0,
    heroId: 'songjiang',
    consumeInitialSeed: true,
  });

  appState.idleRandomEventTimerId.fn();

  assert.equal(capturedDurationMs, 4700);
  assert.equal(appState.supportRoamingUnlockTimerId.delayMs, 4700);
});
