#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_PATH,
    path.join(process.env.USERPROFILE || '', '.codex', 'skills', 'develop-web-game', 'node_modules', 'playwright'),
    path.join(__dirname, 'node_modules', 'playwright'),
    'playwright',
  ].filter(Boolean);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Unable to load playwright');
}

const { chromium } = loadPlaywright();

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:18791',
    timeoutMs: 15000,
    screenshotDir: path.join('output', 'web-game', 'regression'),
    headless: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      args.url = next;
      i++;
    } else if (arg === '--timeout-ms' && next) {
      args.timeoutMs = parseInt(next, 10);
      i++;
    } else if (arg === '--screenshot-dir' && next) {
      args.screenshotDir = next;
      i++;
    } else if (arg === '--headless' && next) {
      args.headless = next !== '0' && next !== 'false';
      i++;
    }
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameText(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function matchesPendingTransition(state, nextState, detail) {
  if (!state || state.scenePhase !== 'main_handoff') return false;
  const pending = state.pendingTransition || null;
  return (
    (state.requestedState === nextState || (pending && pending.state === nextState)) &&
    (
      sameText(state.requestedDetail, detail) ||
      sameText(state.currentDetail, detail) ||
      (pending && sameText(pending.detail, detail))
    )
  );
}

function matchesWorkerScene(state, nextState, heroId, subscene, detail) {
  if (!state || state.scenePhase !== 'child_active') return false;
  if (state.currentState !== nextState) return false;
  if (heroId && state.currentWorkerHeroId !== heroId) return false;
  if (subscene && (!state.sceneObjectDebug || state.sceneObjectDebug.currentSubscene !== subscene)) return false;
  if (detail && !sameText(state.currentDetail, detail)) return false;
  return true;
}

function matchesTransitionAcceptance(state, options) {
  if (!state || !options) return false;
  const nextState = String(options.nextState || '');
  const detail = String(options.detail || '');
  const heroId = options.heroId || null;
  const subscene = options.subscene || nextState || null;
  const interruptedHeroId = options.interruptedHeroId || null;

  if (interruptedHeroId) {
    if (state.activeIdleEventHeroId !== null) return false;
    if (state.bubbleHeroId && state.bubbleHeroId === interruptedHeroId) return false;
  }

  return (
    matchesPendingTransition(state, nextState, detail) ||
    matchesWorkerScene(state, nextState, heroId, subscene, detail)
  );
}

async function readDebugState(page) {
  return page.evaluate(() => {
    if (!window.StarOfficeApp || typeof window.StarOfficeApp.getDebugState !== 'function') return null;
    return window.StarOfficeApp.getDebugState();
  });
}

async function refreshState(page) {
  return page.evaluate(async () => {
    if (!window.StarOfficeApp || typeof window.StarOfficeApp.fetchStatusNow !== 'function') return null;
    return window.StarOfficeApp.fetchStatusNow();
  });
}

async function postState(page, payload) {
  return page.evaluate(async (body) => {
    const response = await fetch('/set_state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }, payload);
}

async function waitForState(page, label, predicate, timeoutMs) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastState = await readDebugState(page);
    if (lastState && predicate(lastState)) {
      return lastState;
    }
    await sleep(200);
  }
  const error = new Error(`Timed out waiting for ${label}`);
  error.lastState = lastState;
  throw error;
}

async function capture(page, dir, name) {
  const target = path.join(dir, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

function anySupportMoved(current, baseline) {
  const heroes = Object.keys(current || {});
  return heroes.some((heroId) => {
    const now = current[heroId];
    const then = baseline[heroId];
    if (!now || !then) return false;
    return Math.abs(now.x - then.x) > 6 || Math.abs(now.y - then.y) > 4;
  });
}

function assertBubbleDebugMetadata(state, label) {
  const style = state && state.bubbleDebug ? state.bubbleDebug.textStyle : null;
  if (!style || typeof style !== 'object') {
    throw new Error(`${label}: bubble debug metadata missing`);
  }
  if (typeof style.platformPreset !== 'string' || typeof style.fontFamily !== 'string') {
    throw new Error(`${label}: bubble debug metadata shape invalid`);
  }
  if (
    typeof style.fontSize !== 'number' ||
    typeof style.fontWeight !== 'number' ||
    typeof style.lineSpacing !== 'number' ||
    typeof style.stroke !== 'string' ||
    typeof style.strokeThickness !== 'number' ||
    typeof style.padX !== 'number' ||
    typeof style.padY !== 'number' ||
    typeof style.maxW !== 'number'
  ) {
    throw new Error(`${label}: bubble debug metadata shape invalid`);
  }
}

function getExpectedBubblePlatformPreset() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'default';
}

function assertBubbleReadabilityPreset(state, label) {
  assertBubbleDebugMetadata(state, label);
  const style = state.bubbleDebug.textStyle;
  const platformPreset = getExpectedBubblePlatformPreset();
  const expectedStyles = {
    windows: {
      platformPreset: 'windows',
      fontFamily: '"Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Source Han Sans TC", sans-serif',
      fontSize: 20,
      fontWeight: 600,
      color: '#17110b',
      stroke: '#fff7e4',
      strokeThickness: 0,
      lineSpacing: 7,
      padX: 18,
      padY: 12,
      maxW: 448,
      textPadding: 1,
    },
    macos: {
      platformPreset: 'macos',
      fontFamily: '"PingFang TC", "SF Pro Text", "Noto Sans TC", "Source Han Sans TC", sans-serif',
      fontSize: 19,
      fontWeight: 600,
      color: '#17110b',
      stroke: '#fff7e4',
      strokeThickness: 0,
      lineSpacing: 6,
      padX: 18,
      padY: 12,
      maxW: 448,
      textPadding: 1,
    },
    default: {
      platformPreset: 'default',
      fontFamily: '"PingFang TC", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "Source Han Sans TC", sans-serif',
      fontSize: 19,
      fontWeight: 600,
      color: '#17110b',
      stroke: '#fff7e4',
      strokeThickness: 0,
      lineSpacing: 6,
      padX: 18,
      padY: 12,
      maxW: 448,
      textPadding: 1,
    },
  };
  const expected = expectedStyles[platformPreset];
  for (const [key, value] of Object.entries(expected)) {
    if (style[key] !== value) {
      throw new Error(`${label}: ${key} mismatch (expected ${JSON.stringify(value)}, got ${JSON.stringify(style[key])})`);
    }
  }
}

async function run() {
  const args = parseArgs(process.argv);
  ensureDir(args.screenshotDir);
  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const checkpoints = [];

  try {
    await page.goto(args.url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.StarOfficeApp && typeof window.StarOfficeApp.getDebugState === 'function');

    await postState(page, { state: 'idle', detail: '回歸測試待命' });
    await refreshState(page);
    const idleState = await waitForState(
      page,
      'main idle bootstrap',
      (state) => state.currentState === 'idle' && state.scenePhase === 'main_idle',
      args.timeoutMs
    );
    checkpoints.push({ label: 'idle_bootstrap', state: idleState });
    await capture(page, args.screenshotDir, '01-idle-bootstrap');

    const baselineCast = idleState.supportCastDebug || {};

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
    assertBubbleReadabilityPreset(seededEvent, 'seeded_songjiang_event');
    checkpoints.push({ label: 'seeded_songjiang_event', state: seededEvent });
    await capture(page, args.screenshotDir, '02-seeded-songjiang-event');

    const roamingState = await waitForState(
      page,
      'support roaming unlock',
      (state) =>
        state.scenePhase === 'main_idle' &&
        state.supportRoamingUnlocked &&
        anySupportMoved(state.supportCastDebug || {}, baselineCast),
      Math.max(args.timeoutMs, 15000)
    );
    checkpoints.push({ label: 'support_roaming', state: roamingState });
    await capture(page, args.screenshotDir, '03-support-roaming');

    await postState(page, { state: 'writing', detail: '回歸測試：正在撰寫內容' });
    await refreshState(page);
    const writingHandoff = await waitForState(
      page,
      'writing transition acceptance',
      (state) => matchesTransitionAcceptance(state, {
        nextState: 'writing',
        detail: '回歸測試：正在撰寫內容',
        heroId: 'wuyong',
        subscene: 'writing',
      }),
      Math.max(args.timeoutMs, 10000)
    );
    checkpoints.push({ label: 'writing_handoff', state: writingHandoff });
    await capture(page, args.screenshotDir, '04-writing-handoff');

    const writingChild = await waitForState(
      page,
      'writing child scene',
      (state) =>
        state.scenePhase === 'child_active' &&
        state.currentWorkerHeroId === 'wuyong' &&
        state.sceneObjectDebug &&
        state.sceneObjectDebug.currentSubscene === 'writing',
      Math.max(args.timeoutMs, 12000)
    );
    checkpoints.push({ label: 'writing_child', state: writingChild });
    await capture(page, args.screenshotDir, '05-writing-child');

    await postState(page, { state: 'idle', detail: '回歸測試待命二' });
    await refreshState(page);
    const secondIdle = await waitForState(
      page,
      'return to idle',
      (state) => state.currentState === 'idle' && state.scenePhase === 'main_idle',
      Math.max(args.timeoutMs, 10000)
    );
    checkpoints.push({ label: 'idle_return', state: secondIdle });

    const idleInterruptEvent = await waitForState(
      page,
      'active idle random event',
      (state) =>
        state.scenePhase === 'main_idle' &&
        state.dialogueMode === 'idle_event' &&
        state.bubbleVisible &&
        !!state.bubbleHeroId &&
        state.bubbleHeroId !== 'songjiang',
      Math.max(args.timeoutMs, 15000)
    );
    assertBubbleReadabilityPreset(idleInterruptEvent, 'idle_interrupt_source');
    checkpoints.push({ label: 'idle_interrupt_source', state: idleInterruptEvent });
    const interruptedHeroId = idleInterruptEvent.bubbleHeroId;
    await capture(page, args.screenshotDir, '06-idle-random-event');

    await postState(page, { state: 'executing', detail: '回歸測試：正在執行命令' });
    await refreshState(page);
    const executingHandoff = await waitForState(
      page,
      'executing transition interrupts idle event',
      (state) => matchesTransitionAcceptance(state, {
        nextState: 'executing',
        detail: '回歸測試：正在執行命令',
        heroId: 'wusong',
        subscene: 'executing',
        interruptedHeroId,
      }),
      Math.max(args.timeoutMs, 10000)
    );
    checkpoints.push({ label: 'executing_handoff_interrupt', state: executingHandoff });
    await capture(page, args.screenshotDir, '07-executing-handoff');

    const executingChild = await waitForState(
      page,
      'executing child scene',
      (state) =>
        state.scenePhase === 'child_active' &&
        state.currentWorkerHeroId === 'wusong' &&
        state.sceneObjectDebug &&
        state.sceneObjectDebug.currentSubscene === 'executing',
      Math.max(args.timeoutMs, 12000)
    );
    checkpoints.push({ label: 'executing_child', state: executingChild });
    await capture(page, args.screenshotDir, '08-executing-child');

    await postState(page, { state: 'idle', detail: '回歸測試完成' });
    await refreshState(page);
    const finalIdle = await waitForState(
      page,
      'final idle restore',
      (state) => state.currentState === 'idle' && state.scenePhase === 'main_idle' && state.currentWorkerHeroId === null,
      Math.max(args.timeoutMs, 10000)
    );
    checkpoints.push({ label: 'final_idle', state: finalIdle });
    await capture(page, args.screenshotDir, '09-final-idle');

    const output = {
      ok: true,
      url: args.url,
      checkpoints: checkpoints.map((entry) => ({ label: entry.label, state: entry.state })),
      screenshotDir: path.resolve(args.screenshotDir),
    };
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    const payload = {
      ok: false,
      message: error && error.message ? error.message : String(error),
      lastState: error && error.lastState ? error.lastState : null,
      screenshotDir: path.resolve(args.screenshotDir),
    };
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
