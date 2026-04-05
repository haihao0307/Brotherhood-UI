const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadThemeRuntimeAndEngine() {
  const context = {
    window: {},
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    JSON,
  };
  context.window = context;
  context.window.StarOfficeThemeRoaming = {
    applyRoamingAPI(ThemeEngine) {
      ThemeEngine.prototype.initSupportRoaming = function () {};
      ThemeEngine.prototype.resetSupportRoaming = function () {};
      ThemeEngine.prototype.setSupportRoamingEnabled = function () {};
      ThemeEngine.prototype.updateSupportRoaming = function () {};
    },
  };

  const runtimeSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'app-theme-runtime.js'),
    'utf8'
  );
  vm.runInNewContext(runtimeSource, context, { filename: 'app-theme-runtime.js' });

  const engineSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'js', 'theme-engine.js'),
    'utf8'
  );
  vm.runInNewContext(engineSource, context, { filename: 'theme-engine.js' });

  return {
    runtime: context.window.StarOfficeThemeRuntime,
    ThemeEngine: context.window.StarOfficeThemeEngine.ThemeEngine,
  };
}

function loadThemeConfig() {
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'themes', 'liangshan', 'theme.json'),
      'utf8'
    )
  );
}

function createNode(textureKey) {
  return {
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
    depth: 0,
    visible: true,
    alpha: 1,
    scale: 1,
    frame: 0,
    texture: { key: textureKey || '__EMPTY' },
    anims: {
      isPlaying: false,
      currentAnim: null,
      play(key) {
        this.isPlaying = true;
        this.currentAnim = { key };
      },
      stop() {
        this.isPlaying = false;
        this.currentAnim = null;
      },
    },
    setOrigin(x, y) {
      this.origin = { x, y };
      return this;
    },
    setDepth(value) {
      this.depth = value;
      return this;
    },
    setVisible(value) {
      this.visible = value;
      return this;
    },
    setTexture(key, frame) {
      this.texture.key = key;
      if (typeof frame === 'number') this.frame = frame;
      return this;
    },
    setFrame(value) {
      this.frame = value;
      return this;
    },
    setScale(value) {
      this.scale = value;
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    setAlpha(value) {
      this.alpha = value;
      return this;
    },
    clearTint() {
      this.tint = null;
      return this;
    },
    setTint(value) {
      this.tint = value;
      return this;
    },
    setInteractive() {
      return this;
    },
    on() {
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function createFakeScene(options) {
  const opts = options || {};
  const preloadCalls = [];
  const textureKeys = new Set(opts.textureKeys || []);
  const createdImages = [];
  const loadEventHandlers = {};
  const loadStartCalls = [];

  function registerLoadHandler(eventName, handler, once) {
    if (!loadEventHandlers[eventName]) loadEventHandlers[eventName] = [];
    loadEventHandlers[eventName].push({ handler, once: !!once });
  }

  function removeLoadHandler(eventName, handler) {
    if (!loadEventHandlers[eventName]) return;
    loadEventHandlers[eventName] = loadEventHandlers[eventName].filter((entry) => entry.handler !== handler);
    if (!loadEventHandlers[eventName].length) delete loadEventHandlers[eventName];
  }

  function emitLoadEvent(eventName) {
    const args = Array.prototype.slice.call(arguments, 1);
    const entries = loadEventHandlers[eventName] ? loadEventHandlers[eventName].slice() : [];
    entries.forEach((entry) => {
      if (entry.once) removeLoadHandler(eventName, entry.handler);
      entry.handler.apply(null, args);
    });
  }

  const scene = {
    load: {
      image(key, url) {
        preloadCalls.push({ key, url });
      },
      spritesheet() {},
      once(eventName, handler) {
        registerLoadHandler(eventName, handler, true);
        return this;
      },
      on(eventName, handler) {
        registerLoadHandler(eventName, handler, false);
        return this;
      },
      off(eventName, handler) {
        removeLoadHandler(eventName, handler);
        return this;
      },
      start() {
        loadStartCalls.push(preloadCalls.length);
        return this;
      },
    },
    add: {
      image(x, y, textureKey) {
        const node = createNode(textureKey).setPosition(x, y);
        createdImages.push(node);
        return node;
      },
      sprite(x, y, textureKey) {
        return createNode(textureKey).setPosition(x, y);
      },
      text() {
        const node = createNode('__TEXT__');
        node.width = 120;
        node.height = 24;
        return node;
      },
      graphics() {
        return {
          fillStyle() { return this; },
          lineStyle() { return this; },
          fillRoundedRect() { return this; },
          strokeRoundedRect() { return this; },
          fillTriangle() { return this; },
          strokeTriangle() { return this; },
        };
      },
      container(x, y) {
        return createNode('__CONTAINER__').setPosition(x, y);
      },
    },
    textures: {
      exists(key) {
        return textureKeys.has(key);
      },
    },
    anims: {
      exists() {
        return false;
      },
      create() {},
      generateFrameNumbers(textureKey, range) {
        return [{ textureKey, range }];
      },
    },
    time: {
      now: 0,
    },
    __preloadCalls: preloadCalls,
    __createdImages: createdImages,
    __loadEventHandlers: loadEventHandlers,
    __loadStartCalls: loadStartCalls,
    __markTextureLoaded(key) {
      textureKeys.add(key);
    },
    __emitLoadComplete() {
      emitLoadEvent('complete');
    },
    __emitLoadError(file) {
      emitLoadEvent('loaderror', file || null);
    },
    __emitFileComplete(key) {
      emitLoadEvent('filecomplete-image-' + key, key);
    },
  };

  return scene;
}

function listMainOverlayTextureKeys(themeConfig) {
  const overlay = themeConfig.mainScene.frontOverlay;
  return Array.from({ length: overlay.frameCount }, (_, index) => 'front_overlay_main_' + String(index).padStart(3, '0'));
}

function toPlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

function setSubsceneFrontOverlay(themeConfig, state, frameCount) {
  themeConfig.subscenes[state].frontOverlay = {
    framesPath: 'props/' + state + '/front',
    filePattern: 'Front_{index}.png',
    startIndex: 1,
    zeroPad: 3,
    frameCount: frameCount || 2,
    fps: 8,
    depth: 5100,
  };
}

test('ThemeEngine preloads the full main-scene front overlay frame set from asset refs, not themeConfig.name', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  themeConfig.name = 'different-name-should-not-drive-overlay-urls';
  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene();

  engine.preload(scene);

  const frontOverlayLoads = scene.__preloadCalls.filter((call) => call.key.startsWith('front_overlay_main_'));
  assert.deepEqual(frontOverlayLoads, [
    {
      key: 'front_overlay_main_000',
      url: '/static/themes/liangshan/props/main/front/Front_001.png?v=123',
    },
    {
      key: 'front_overlay_main_001',
      url: '/static/themes/liangshan/props/main/front/Front_002.png?v=123',
    },
    {
      key: 'front_overlay_main_002',
      url: '/static/themes/liangshan/props/main/front/Front_003.png?v=123',
    },
    {
      key: 'front_overlay_main_003',
      url: '/static/themes/liangshan/props/main/front/Front_004.png?v=123',
    },
  ]);
});

test('ThemeEngine plays the main-scene front overlay through a full loop while idle', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene({
    textureKeys: ['scene_bg_main', ...listMainOverlayTextureKeys(themeConfig)],
  });

  engine.create(scene);

  assert.ok(engine.frontOverlayNode);
  assert.equal(engine.frontOverlayNode.texture.key, 'front_overlay_main_000');
  assert.equal(engine.frontOverlayNode.x, 640);
  assert.equal(engine.frontOverlayNode.y, 360);
  assert.equal(engine.frontOverlayNode.depth, 5000);
  assert.equal(engine.frontOverlayNode.visible, true);

  engine.update(100, 16);
  assert.equal(engine.frontOverlayNode.texture.key, 'front_overlay_main_001');
  engine.update(200, 16);
  assert.equal(engine.frontOverlayNode.texture.key, 'front_overlay_main_002');
  engine.update(300, 16);
  assert.equal(engine.frontOverlayNode.texture.key, 'front_overlay_main_003');
  engine.update(400, 16);
  assert.equal(engine.frontOverlayNode.texture.key, 'front_overlay_main_000');
});

test('ThemeEngine hides the front overlay when the first frame texture is unavailable', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene({
    textureKeys: ['scene_bg_main'],
  });

  engine.create(scene);

  assert.ok(engine.frontOverlayNode);
  assert.equal(engine.frontOverlayNode.visible, false);
  assert.equal(engine.activeFrontOverlayOwner, null);
  assert.equal(engine.activeFrontOverlayConfig, null);
});

test('ThemeEngine keeps the main-scene front overlay visible through main handoff and hides it for an unloaded child scene', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene({
    textureKeys: ['scene_bg_main', 'scene_bg_writing', ...listMainOverlayTextureKeys(themeConfig)],
  });

  engine.create(scene);
  assert.equal(engine.frontOverlayNode.visible, true);

  engine.enterMainHandoff('writing');
  assert.equal(engine.frontOverlayNode.visible, true);
  assert.equal(engine.activeFrontOverlayOwner, 'main');

  engine.enterMainIdle();
  assert.equal(engine.frontOverlayNode.visible, true);
  assert.equal(engine.activeFrontOverlayOwner, 'main');

  engine.enterChildScene('writing');
  assert.equal(engine.frontOverlayNode.visible, false);
  assert.equal(engine.activeFrontOverlayOwner, null);
});

test('ThemeEngine lazy-loads a subscene front overlay without blocking child scene activation', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  setSubsceneFrontOverlay(themeConfig, 'writing', 2);

  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene({
    textureKeys: ['scene_bg_main', 'scene_bg_writing', ...listMainOverlayTextureKeys(themeConfig)],
  });

  engine.preload(scene);
  engine.create(scene);
  assert.deepEqual(toPlainData(engine.getDebugSceneState().frontOverlay), {
    activeOwnerKey: 'main',
    loadedOwners: ['main'],
    failedOwners: [],
    frameIndex: 0,
    visible: true,
  });

  const writingLoadsBeforeEnter = scene.__preloadCalls.filter((call) => call.key.startsWith('front_overlay_writing_'));
  assert.equal(writingLoadsBeforeEnter.length, 0);

  engine.enterChildScene('writing');

  assert.equal(engine.sceneMode, 'child_active');
  assert.equal(engine.currentSubscene, 'writing');
  assert.equal(engine.childActor.visible, true);
  assert.equal(engine.frontOverlayNode.visible, false);
  assert.equal(engine.activeFrontOverlayOwner, null);

  const writingLoads = scene.__preloadCalls.filter((call) => call.key.startsWith('front_overlay_writing_'));
  assert.deepEqual(writingLoads, [
    {
      key: 'front_overlay_writing_000',
      url: '/static/themes/liangshan/props/writing/front/Front_001.png?v=123',
    },
    {
      key: 'front_overlay_writing_001',
      url: '/static/themes/liangshan/props/writing/front/Front_002.png?v=123',
    },
  ]);
  assert.equal(scene.__loadStartCalls.length, 1);

  scene.__markTextureLoaded('front_overlay_writing_000');
  scene.__markTextureLoaded('front_overlay_writing_001');
  scene.__emitFileComplete('front_overlay_writing_000');
  scene.__emitFileComplete('front_overlay_writing_001');

  assert.equal(engine.frontOverlayNode.visible, true);
  assert.equal(engine.activeFrontOverlayOwner, 'writing');
  assert.equal(engine.frontOverlayNode.texture.key, 'front_overlay_writing_000');
  assert.deepEqual(toPlainData(engine.getDebugSceneState().frontOverlay), {
    activeOwnerKey: 'writing',
    loadedOwners: ['main', 'writing'],
    failedOwners: [],
    frameIndex: 0,
    visible: true,
  });
});

test('ThemeEngine quarantines a failed subscene front overlay load', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  setSubsceneFrontOverlay(themeConfig, 'writing', 2);

  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene({
    textureKeys: ['scene_bg_main', 'scene_bg_writing', ...listMainOverlayTextureKeys(themeConfig)],
  });

  engine.preload(scene);
  engine.create(scene);
  engine.enterChildScene('writing');

  const firstLoadCount = scene.__preloadCalls.filter((call) => call.key.startsWith('front_overlay_writing_')).length;
  assert.equal(firstLoadCount, 2);

  scene.__emitLoadError({ key: 'front_overlay_writing_000' });

  assert.equal(engine.frontOverlayNode.visible, false);
  assert.equal(engine.activeFrontOverlayOwner, null);
  assert.equal(engine.failedFrontOverlayOwners.writing, true);
  assert.equal(engine.loadedFrontOverlayOwners.writing, undefined);
  assert.deepEqual(toPlainData(engine.getDebugSceneState().frontOverlay), {
    activeOwnerKey: null,
    loadedOwners: ['main'],
    failedOwners: ['writing'],
    frameIndex: 0,
    visible: false,
  });

  engine.queueFrontOverlayLoad('writing');

  const secondLoadCount = scene.__preloadCalls.filter((call) => call.key.startsWith('front_overlay_writing_')).length;
  assert.equal(secondLoadCount, firstLoadCount);
  assert.equal(scene.__loadStartCalls.length, 1);
});

test('ThemeEngine keeps a partially failed subscene front overlay quarantined even if frame 0 exists', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  setSubsceneFrontOverlay(themeConfig, 'writing', 2);

  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene({
    textureKeys: ['scene_bg_main', 'scene_bg_writing', ...listMainOverlayTextureKeys(themeConfig)],
  });

  engine.preload(scene);
  engine.create(scene);
  engine.enterChildScene('writing');

  scene.__markTextureLoaded('front_overlay_writing_000');
  scene.__emitFileComplete('front_overlay_writing_000');
  scene.__emitLoadError({ key: 'front_overlay_writing_001' });

  assert.equal(engine.failedFrontOverlayOwners.writing, true);
  assert.equal(engine.loadedFrontOverlayOwners.writing, undefined);
  assert.equal(engine.frontOverlayNode.visible, false);

  engine.showFrontOverlayForScene('writing');

  assert.equal(engine.frontOverlayNode.visible, false);
  assert.equal(engine.activeFrontOverlayOwner, null);
  assert.deepEqual(toPlainData(engine.getDebugSceneState().frontOverlay), {
    activeOwnerKey: null,
    loadedOwners: ['main'],
    failedOwners: ['writing'],
    frameIndex: 0,
    visible: false,
  });
});

test('ThemeEngine isolates pending subscene front overlay batches by owner', () => {
  const { ThemeEngine } = loadThemeRuntimeAndEngine();
  const themeConfig = loadThemeConfig();
  setSubsceneFrontOverlay(themeConfig, 'writing', 2);
  setSubsceneFrontOverlay(themeConfig, 'researching', 2);

  const engine = new ThemeEngine(themeConfig, { version: '123', supportsWebP: false });
  const scene = createFakeScene({
    textureKeys: ['scene_bg_main', 'scene_bg_writing', 'scene_bg_researching', ...listMainOverlayTextureKeys(themeConfig)],
  });

  engine.preload(scene);
  engine.create(scene);

  engine.enterChildScene('writing');
  engine.enterChildScene('researching');

  const writingLoads = scene.__preloadCalls.filter((call) => call.key.startsWith('front_overlay_writing_'));
  const researchingLoads = scene.__preloadCalls.filter((call) => call.key.startsWith('front_overlay_researching_'));
  assert.equal(writingLoads.length, 2);
  assert.equal(researchingLoads.length, 2);
  assert.equal(scene.__loadStartCalls.length, 2);

  scene.__markTextureLoaded('front_overlay_writing_000');
  scene.__emitFileComplete('front_overlay_writing_000');
  scene.__markTextureLoaded('front_overlay_writing_001');
  scene.__emitFileComplete('front_overlay_writing_001');

  assert.equal(engine.loadedFrontOverlayOwners.writing, true);
  assert.equal(engine.loadedFrontOverlayOwners.researching, undefined);
  assert.equal(engine.activeFrontOverlayOwner, null);
  assert.equal(engine.frontOverlayNode.visible, false);

  scene.__markTextureLoaded('front_overlay_researching_000');
  scene.__emitFileComplete('front_overlay_researching_000');
  scene.__emitLoadError({ key: 'front_overlay_researching_001' });

  assert.equal(engine.loadedFrontOverlayOwners.writing, true);
  assert.equal(engine.failedFrontOverlayOwners.researching, true);
  assert.equal(engine.loadedFrontOverlayOwners.researching, undefined);
  assert.equal(engine.activeFrontOverlayOwner, null);
  assert.equal(engine.frontOverlayNode.visible, false);
  assert.deepEqual(toPlainData(engine.getDebugSceneState().frontOverlay), {
    activeOwnerKey: null,
    loadedOwners: ['main', 'writing'],
    failedOwners: ['researching'],
    frameIndex: 0,
    visible: false,
  });
});
