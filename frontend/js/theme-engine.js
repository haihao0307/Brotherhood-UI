(function () {
  'use strict';

  const runtimeHelpers = window.StarOfficeThemeRuntime || {};
  const roamingApi = window.StarOfficeThemeRoaming || {};
  const KNOWN_STATES = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'];
  const safeArray = runtimeHelpers.safeArray;
  const clamp = runtimeHelpers.clamp;
  const normalizeAssetRef = runtimeHelpers.normalizeAssetRef;
  const normalizeAssetOrigin = runtimeHelpers.normalizeOrigin;
  const normalizeSpriteAsset = runtimeHelpers.normalizeSpriteAsset;
  const resolveAssetUrl = runtimeHelpers.resolveAssetUrl;
  const assetMatchesScope = runtimeHelpers.assetMatchesScope;
  const makeStateTextureKey = runtimeHelpers.makeStateTextureKey;
  const expandObjectDefinitions = runtimeHelpers.expandObjectDefinitions;
  const resolveStateAsset = runtimeHelpers.resolveStateAsset;
  const buildRuntimeTheme = runtimeHelpers.buildRuntimeTheme;

  function padNumber(value, digits) {
    return String(Math.max(0, Number(value) || 0)).padStart(Math.max(1, Number(digits) || 1), '0');
  }

  function normalizePathSegment(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  }

  function extractThemeStaticRoot(asset) {
    const node = normalizeAssetRef(asset);
    const candidates = [];
    if (node && typeof node.png === 'string') candidates.push(node.png.replace(/\\/g, '/'));
    if (node && typeof node.webp === 'string') candidates.push(node.webp.replace(/\\/g, '/'));

    for (let i = 0; i < candidates.length; i++) {
      const match = candidates[i].match(/^(\/static\/themes\/[^/]+)/);
      if (match) return match[1];
    }

    return '';
  }

  function ThemeEngine(themeConfig, opts) {
    this.themeConfig = themeConfig || {};
    this.runtime = buildRuntimeTheme(themeConfig || {});
    this.version = (opts && opts.version) || '0';
    this.supportsWebP = !!(opts && opts.supportsWebP);

    this.scene = null;
    this.bg = null;
    this.mainObjects = [];
    this.childObjectsByState = {};
    this.objectBubbles = [];

    this.mainActor = null;
    this.supportCast = {};
    this.childActor = null;
    this.hero = null;

    this.heroBase = { x: 640, y: 600 };
    this.target = { x: 640, y: 600 };
    this.moving = false;

    this.currentState = 'idle';
    this.sceneMode = 'main_idle';
    this.activeWorkerHeroId = null;
    this.handoffTargetHeroId = null;
    this.currentSubscene = null;
    this.idleEventEmphasis = {};
    this.supportRoamingEnabled = false;
    this.supportRoamingState = {};

    this.frontOverlayNode = null;
    this.activeFrontOverlayOwner = null;
    this.activeFrontOverlayConfig = null;
    this.frontOverlayFrameIndex = 0;
    this.nextFrontOverlayFrameAt = 0;
    this.loadedFrontOverlayOwners = {};
    this.failedFrontOverlayOwners = {};
    this.pendingFrontOverlayOwners = {};
  }

  ThemeEngine.prototype.preload = function (scene) {
    this.scene = scene;
    const runtime = this.runtime;
    const version = this.version;
    const supportsWebP = this.supportsWebP;

    const mainBgUrl = resolveAssetUrl(runtime.mainScene.background, version, supportsWebP);
    if (mainBgUrl) scene.load.image('scene_bg_main', mainBgUrl);

    Object.keys(runtime.subscenes).forEach((state) => {
      const node = runtime.subscenes[state];
      const url = resolveAssetUrl(node.background, version, supportsWebP);
      if (!url) return;
      scene.load.image('scene_bg_' + state, url);
    });

    this.preloadFrontOverlayForScene(scene, 'idle');

    this.preloadActorStates(scene, 'main', runtime.mainHero);
    Object.keys(runtime.supportHeroes).forEach((heroId) => {
      this.preloadActorStates(scene, 'support', runtime.supportHeroes[heroId]);
    });

    const spritesheets = (runtime.assets && runtime.assets.spritesheets) ? runtime.assets.spritesheets : {};
    Object.keys(spritesheets).forEach((key) => {
      const sh = normalizeSpriteAsset(spritesheets[key], 1.0);
      const url = resolveAssetUrl(spritesheets[key], version, supportsWebP);
      if (!sh || !url) return;
      scene.load.spritesheet('ss_' + key, url, {
        frameWidth: sh.frameWidth,
        frameHeight: sh.frameHeight
      });
    });
  };

  ThemeEngine.prototype.preloadActorStates = function (scene, prefix, actorDef) {
    if (!actorDef || !actorDef.states) return;
    Object.keys(actorDef.states).forEach((state) => {
      const asset = actorDef.states[state];
      const url = resolveAssetUrl(asset, this.version, this.supportsWebP);
      if (!url) return;
      scene.load.spritesheet(makeStateTextureKey(prefix, actorDef.id, state), url, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight
      });
    });
  };

  ThemeEngine.prototype.resolveFrontOverlayOwnerKey = function (sceneState) {
    if (!sceneState || sceneState === 'idle' || sceneState === 'main') return 'main';
    return String(sceneState);
  };

  ThemeEngine.prototype.resolveFrontOverlayConfig = function (sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    if (owner === 'main') return this.runtime.mainScene.frontOverlay || null;
    const subscene = this.runtime.subscenes[owner];
    return subscene ? (subscene.frontOverlay || null) : null;
  };

  ThemeEngine.prototype.isFrontOverlayLoaded = function (sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    return !!this.loadedFrontOverlayOwners[owner];
  };

  ThemeEngine.prototype.markFrontOverlayLoaded = function (sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    this.loadedFrontOverlayOwners[owner] = true;
    delete this.failedFrontOverlayOwners[owner];
    this.clearPendingFrontOverlayLoad(owner);
  };

  ThemeEngine.prototype.markFrontOverlayFailed = function (sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    this.failedFrontOverlayOwners[owner] = true;
    delete this.loadedFrontOverlayOwners[owner];
    this.clearPendingFrontOverlayLoad(owner);
    if (this.activeFrontOverlayOwner === owner) this.hideFrontOverlay();
  };

  ThemeEngine.prototype.clearPendingFrontOverlayLoad = function (sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    const pending = this.pendingFrontOverlayOwners[owner];
    if (pending && pending.scene && pending.scene.load && typeof pending.scene.load.off === 'function') {
      if (pending.onLoadError) pending.scene.load.off('loaderror', pending.onLoadError);
      safeArray(pending.fileCompleteEvents).forEach((eventName) => {
        const handler = pending.onFileCompleteByEvent ? pending.onFileCompleteByEvent[eventName] : null;
        if (handler) pending.scene.load.off(eventName, handler);
      });
    }
    delete this.pendingFrontOverlayOwners[owner];
  };

  ThemeEngine.prototype.buildFrontOverlayFrameSpecs = function (sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    const config = this.resolveFrontOverlayConfig(sceneState);
    const themeRootAsset = owner === 'main'
      ? this.runtime.mainScene.background
      : ((this.runtime.subscenes[owner] && this.runtime.subscenes[owner].background) || this.runtime.mainScene.background);
    const themeStaticRoot = extractThemeStaticRoot(themeRootAsset);
    if (!config || !themeStaticRoot) return [];

    const framesPath = normalizePathSegment(config.framesPath);
    if (!framesPath) return [];

    const basePath = themeStaticRoot + '/' + framesPath;
    const frameSpecs = [];
    for (let index = 0; index < config.frameCount; index++) {
      const frameNumber = config.startIndex + index;
      const fileName = String(config.filePattern || 'Front_{index}.png')
        .split('{index}')
        .join(padNumber(frameNumber, config.zeroPad));
      const assetRef = {
        png: basePath + '/' + fileName
      };
      frameSpecs.push({
        owner: owner,
        textureKey: 'front_overlay_' + owner + '_' + padNumber(index, 3),
        assetRef: assetRef,
        url: resolveAssetUrl(assetRef, this.version, this.supportsWebP)
      });
    }
    return frameSpecs;
  };

  ThemeEngine.prototype.preloadFrontOverlayForScene = function (scene, sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    if (!scene || this.isFrontOverlayLoaded(owner)) return;

    const frameSpecs = this.buildFrontOverlayFrameSpecs(sceneState);
    if (!frameSpecs.length) {
      return;
    }

    frameSpecs.forEach((frameSpec) => {
      scene.load.image(frameSpec.textureKey, frameSpec.url);
    });

    this.markFrontOverlayLoaded(owner);
  };

  ThemeEngine.prototype.areFrontOverlayFramesReady = function (sceneState) {
    const scene = this.scene;
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    if (this.failedFrontOverlayOwners[owner] || !scene || !scene.textures || typeof scene.textures.exists !== 'function') {
      return false;
    }
    const frameSpecs = this.buildFrontOverlayFrameSpecs(owner);
    if (!frameSpecs.length) return false;
    for (let i = 0; i < frameSpecs.length; i++) {
      if (!scene.textures.exists(frameSpecs[i].textureKey)) return false;
    }
    return true;
  };

  ThemeEngine.prototype.ensureFrontOverlayReady = function (sceneState) {
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    if (this.failedFrontOverlayOwners[owner]) return false;
    if (this.isFrontOverlayLoaded(owner)) return true;
    if (!this.areFrontOverlayFramesReady(owner)) return false;
    this.markFrontOverlayLoaded(owner);
    return true;
  };

  ThemeEngine.prototype.isFrontOverlayOwnerActive = function (owner) {
    const resolvedOwner = this.resolveFrontOverlayOwnerKey(owner);
    if (resolvedOwner === 'main') {
      return this.sceneMode === 'main_idle' || this.sceneMode === 'main_handoff';
    }
    return this.sceneMode === 'child_active' && this.currentSubscene === resolvedOwner;
  };

  ThemeEngine.prototype.queueFrontOverlayLoad = function (sceneState) {
    const scene = this.scene;
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    const config = this.resolveFrontOverlayConfig(sceneState);
    if (!scene || !scene.load || !config || this.isFrontOverlayLoaded(owner) || this.failedFrontOverlayOwners[owner] || this.pendingFrontOverlayOwners[owner]) {
      return;
    }

    const frameSpecs = this.buildFrontOverlayFrameSpecs(sceneState);
    if (!frameSpecs.length) {
      this.markFrontOverlayFailed(owner);
      return;
    }

    const pending = {
      owner: owner,
      scene: scene,
      remainingKeys: {},
      fileCompleteEvents: [],
      onFileCompleteByEvent: {},
      onLoadError: null
    };
    frameSpecs.forEach((frameSpec) => {
      pending.remainingKeys[frameSpec.textureKey] = true;
    });

    const settleLoaded = () => {
      if (this.pendingFrontOverlayOwners[owner] !== pending) return;
      this.markFrontOverlayLoaded(owner);
      if (this.isFrontOverlayOwnerActive(owner)) this.showFrontOverlayForScene(owner);
    };
    const settleFailed = () => {
      if (this.pendingFrontOverlayOwners[owner] !== pending) return;
      this.markFrontOverlayFailed(owner);
    };

    this.pendingFrontOverlayOwners[owner] = pending;
    frameSpecs.forEach((frameSpec) => {
      scene.load.image(frameSpec.textureKey, frameSpec.url);
    });

    if (typeof scene.load.on === 'function' && typeof scene.load.off === 'function') {
      pending.onLoadError = function (file) {
        const failedKey = file && file.key ? String(file.key) : '';
        if (!failedKey || !pending.remainingKeys[failedKey]) return;
        settleFailed();
      };
      scene.load.on('loaderror', pending.onLoadError);

      frameSpecs.forEach((frameSpec) => {
        const eventName = 'filecomplete-image-' + frameSpec.textureKey;
        const handler = function () {
          if (this.pendingFrontOverlayOwners[owner] !== pending) return;
          delete pending.remainingKeys[frameSpec.textureKey];
          if (!Object.keys(pending.remainingKeys).length) settleLoaded();
        }.bind(this);
        pending.fileCompleteEvents.push(eventName);
        pending.onFileCompleteByEvent[eventName] = handler;
        scene.load.on(eventName, handler);
      });
    } else if (this.areFrontOverlayFramesReady(owner)) {
      settleLoaded();
    }

    if (typeof scene.load.start === 'function') {
      scene.load.start();
    }
  };

  ThemeEngine.prototype.create = function (scene) {
    this.scene = scene;

    this.bg = scene.add.image(640, 360, 'scene_bg_main').setOrigin(0.5);
    this.fitBackground(this.bg);
    this.bg.setDepth(0);
    this.ensureFrontOverlayNode(scene);

    this.createMainCast(scene);
    this.createChildActor(scene);
    this.mainObjects = this.createObjectsFromDefs(scene, this.runtime.mainObjects, this.runtime.mainScene.propsRoot);
    Object.keys(this.runtime.subscenes).forEach((state) => {
      const defs = this.runtime.subscenes[state].objects || [];
      const nodes = this.createObjectsFromDefs(scene, defs, this.runtime.subscenes[state].propsRoot);
      this.childObjectsByState[state] = nodes;
      this.setObjectListVisible(nodes, false);
    });

    this.enterMainIdle();
  };

  ThemeEngine.prototype.ensureFrontOverlayNode = function (scene) {
    if (this.frontOverlayNode) return this.frontOverlayNode;
    const initialTexture = scene && scene.textures && typeof scene.textures.exists === 'function' && scene.textures.exists('scene_bg_main')
      ? 'scene_bg_main'
      : '__MISSING';
    this.frontOverlayNode = scene.add.image(640, 360, initialTexture).setOrigin(0.5, 0.5);
    this.frontOverlayNode.setDepth(5000);
    this.frontOverlayNode.setVisible(false);
    return this.frontOverlayNode;
  };

  ThemeEngine.prototype.showFrontOverlayForScene = function (sceneState) {
    const scene = this.scene;
    const owner = this.resolveFrontOverlayOwnerKey(sceneState);
    const config = this.resolveFrontOverlayConfig(sceneState);
    const frameSpecs = this.buildFrontOverlayFrameSpecs(sceneState);
    const node = scene ? this.ensureFrontOverlayNode(scene) : null;

    if (!scene || !node) {
      this.hideFrontOverlay();
      return;
    }
    if (!config) {
      this.hideFrontOverlay();
      return;
    }
    if (!frameSpecs.length) {
      this.hideFrontOverlay();
      return;
    }
    if (!this.ensureFrontOverlayReady(owner)) {
      this.hideFrontOverlay();
      return;
    }

    const firstFrame = frameSpecs[0];
    if (!scene.textures.exists(firstFrame.textureKey)) {
      this.markFrontOverlayFailed(owner);
      return;
    }

    node.setTexture(firstFrame.textureKey, 0);
    node.setPosition(640, 360);
    node.setDepth(typeof config.depth === 'number' ? config.depth : 5000);
    node.setVisible(true);

    this.activeFrontOverlayOwner = owner;
    this.activeFrontOverlayConfig = config;
    this.frontOverlayFrameIndex = 0;
    this.nextFrontOverlayFrameAt = (scene.time && typeof scene.time.now === 'number' ? scene.time.now : 0) + (1000 / Math.max(1, Number(config.fps || 1)));
    delete this.failedFrontOverlayOwners[owner];
  };

  ThemeEngine.prototype.hideFrontOverlay = function () {
    if (this.frontOverlayNode) this.frontOverlayNode.setVisible(false);
    this.activeFrontOverlayOwner = null;
    this.activeFrontOverlayConfig = null;
    this.frontOverlayFrameIndex = 0;
    this.nextFrontOverlayFrameAt = 0;
  };

  ThemeEngine.prototype.updateFrontOverlay = function (time) {
    if (!this.frontOverlayNode || !this.frontOverlayNode.visible || !this.activeFrontOverlayConfig || !this.activeFrontOverlayOwner) return;
    if (!this.nextFrontOverlayFrameAt || time < this.nextFrontOverlayFrameAt) return;

    const owner = this.activeFrontOverlayOwner;
    const frameSpecs = this.buildFrontOverlayFrameSpecs(owner);
    const config = this.activeFrontOverlayConfig;
    if (!frameSpecs.length) {
      this.markFrontOverlayFailed(owner);
      return;
    }

    const frameDuration = 1000 / Math.max(1, Number(config.fps || 1));
    while (this.activeFrontOverlayOwner === owner && this.nextFrontOverlayFrameAt && time >= this.nextFrontOverlayFrameAt) {
      let nextIndex = this.frontOverlayFrameIndex + 1;
      if (nextIndex >= frameSpecs.length) {
        if (config.loop === false) {
          nextIndex = frameSpecs.length - 1;
          this.frontOverlayFrameIndex = nextIndex;
          this.frontOverlayNode.setTexture(frameSpecs[nextIndex].textureKey, 0);
          this.nextFrontOverlayFrameAt = 0;
          return;
        }
        nextIndex = 0;
      }

      const nextFrame = frameSpecs[nextIndex];
      if (!this.scene.textures.exists(nextFrame.textureKey)) {
        this.markFrontOverlayFailed(owner);
        return;
      }

      this.frontOverlayFrameIndex = nextIndex;
      this.frontOverlayNode.setTexture(nextFrame.textureKey, 0);
      this.nextFrontOverlayFrameAt += frameDuration;
    }
  };

  ThemeEngine.prototype.createMainCast = function (scene) {
    const runtime = this.runtime;
    const mainCastNode = runtime.mainScene.cast[runtime.mainHero.id] || { x: 640, y: 600, depth: 240, animationState: 'idle_a' };
    const mainInitial = resolveStateAsset(runtime.mainHero, mainCastNode.animationState) || resolveStateAsset(runtime.mainHero, 'idle');
    const mainTexture = mainInitial ? makeStateTextureKey('main', runtime.mainHero.id, mainInitial.state) : '__MISSING';

    this.mainActor = scene.add.sprite(mainCastNode.x, mainCastNode.y, mainTexture).setOrigin(runtime.mainHero.origin.x, runtime.mainHero.origin.y);
    this.mainActor.setDepth(typeof mainCastNode.depth === 'number' ? mainCastNode.depth : 240);
    this.playActorState(this.mainActor, runtime.mainHero, 'main', mainCastNode.animationState);

    Object.keys(runtime.supportHeroes).forEach((heroId) => {
      const heroDef = runtime.supportHeroes[heroId];
      const castNode = runtime.mainScene.cast[heroId];
      if (!castNode) return;
      const initial = resolveStateAsset(heroDef, castNode.animationState || 'idle') || resolveStateAsset(heroDef, 'idle');
      const texture = initial ? makeStateTextureKey('support', heroId, initial.state) : '__MISSING';
      const actor = scene.add.sprite(castNode.x, castNode.y, texture).setOrigin(heroDef.origin.x, heroDef.origin.y);
      actor.setDepth(typeof castNode.depth === 'number' ? castNode.depth : heroDef.depth);
      this.playActorState(actor, heroDef, 'support', castNode.animationState || 'idle');
      this.supportCast[heroId] = actor;
    });

    this.heroBase = { x: this.mainActor.x, y: this.mainActor.y };
    this.target = { x: this.mainActor.x, y: this.mainActor.y };
    this.hero = this.mainActor;

    this.initStateAnimations(scene, 'main', runtime.mainHero.id, runtime.mainHero.states);
    Object.keys(runtime.supportHeroes).forEach((heroId) => {
      this.initStateAnimations(scene, 'support', heroId, runtime.supportHeroes[heroId].states);
    });
    this.initSupportRoaming();
  };

  ThemeEngine.prototype.createChildActor = function (scene) {
    const mainHero = this.runtime.mainHero;
    const initial = resolveStateAsset(mainHero, 'idle') || resolveStateAsset(mainHero, 'idle_a');
    const texture = initial ? makeStateTextureKey('main', mainHero.id, initial.state) : '__MISSING';
    this.childActor = scene.add.sprite(640, 600, texture).setOrigin(mainHero.origin.x, mainHero.origin.y);
    this.childActor.setDepth(220);
    this.childActor.setVisible(false);
  };

  ThemeEngine.prototype.initStateAnimations = function (scene, prefix, actorId, states) {
    if (!states) return;
    Object.keys(states).forEach((state) => {
      const asset = states[state];
      const textureKey = makeStateTextureKey(prefix, actorId, state);
      if (!scene.textures.exists(textureKey)) return;
      const animKey = textureKey + '_anim';
      if (scene.anims.exists(animKey)) return;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: Math.max(0, asset.frames - 1) }),
        frameRate: asset.frameRate,
        repeat: asset.loop === false ? 0 : -1
      });
    });
  };

  ThemeEngine.prototype.createObjectsFromDefs = function (scene, defs, scopeRoot) {
    const spritesheets = (this.runtime.assets && this.runtime.assets.spritesheets) ? this.runtime.assets.spritesheets : {};
    const nodes = [];

    const ensureAnim = (key, sh) => {
      const animKey = 'anim_' + key;
      if (scene.anims.exists(animKey)) return animKey;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers('ss_' + key, { start: 0, end: Math.max(0, Number(sh.frames || 1) - 1) }),
        frameRate: Math.max(1, Number(sh.frameRate || 6)),
        repeat: -1
      });
      return animKey;
    };

    expandObjectDefinitions(defs).forEach((objectDef) => {
      if (!objectDef || typeof objectDef !== 'object') return;
      const type = objectDef.type || 'animated';
      const depth = (typeof objectDef.depth === 'number') ? objectDef.depth : 50;
      const scale = (typeof objectDef.scale === 'number') ? objectDef.scale : 1.0;
      const origin = normalizeAssetOrigin(objectDef.origin, { x: 0.5, y: 1.0 });

      if (type === 'animated') {
        const key = objectDef.key;
        const sh = spritesheets[key];
        if (!assetMatchesScope(sh, scopeRoot)) return;
        if (!key || !sh || !scene.textures.exists('ss_' + key)) return;
        const animKey = ensureAnim(key, sh);
        const sp = scene.add.sprite(objectDef.x || 0, objectDef.y || 0, 'ss_' + key, 0).setOrigin(origin.x, origin.y);
        sp.setScale(scale);
        sp.setDepth(depth);
        sp.anims.play(animKey, true);
        nodes.push(sp);
        if (objectDef.clickText) this.attachObjectBubble(scene, sp, objectDef.clickText);
        return;
      }

      if (type === 'image') {
        const imgKey = objectDef.imageKey;
        if (!imgKey || !scene.textures.exists(imgKey)) return;
        const image = scene.add.image(objectDef.x || 0, objectDef.y || 0, imgKey).setOrigin(origin.x, origin.y);
        image.setScale(scale);
        image.setDepth(depth);
        nodes.push(image);
        if (objectDef.clickText) this.attachObjectBubble(scene, image, objectDef.clickText);
      }
    });

    return nodes;
  };

  ThemeEngine.prototype.attachObjectBubble = function (scene, target, text) {
    target.setInteractive({ useHandCursor: true });
    target.on('pointerdown', (pointer) => {
      pointer.event.stopPropagation();
      const fontSize = 12;
      const padX = 8;
      const padY = 6;
      const maxW = 220;

      const txt = scene.add.text(0, 0, String(text), {
        fontFamily: 'ArkPixel, monospace',
        fontSize: fontSize + 'px',
        color: '#111',
        wordWrap: { width: maxW }
      }).setOrigin(0.5);

      const w = clamp(txt.width + padX * 2, 60, maxW + padX * 2);
      const h = clamp(txt.height + padY * 2, 26, 80);

      const g = scene.add.graphics();
      g.fillStyle(0xfff7d6, 0.98);
      g.lineStyle(3, 0x1b1b1b, 1);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
      g.fillTriangle(-10, h / 2 - 2, 10, h / 2 - 2, 0, h / 2 + 12);
      g.strokeTriangle(-10, h / 2 - 2, 10, h / 2 - 2, 0, h / 2 + 12);

      const c = scene.add.container(target.x, target.y - 30, [g, txt]);
      c.setDepth(9999);
      this.objectBubbles.push({ node: c, t: scene.time.now + 2400 });
    });
  };

  ThemeEngine.prototype.fitBackground = function (bg) {
    if (!bg) return;
    const scaleX = 1280 / bg.width;
    const scaleY = 720 / bg.height;
    bg.setScale(Math.max(scaleX, scaleY));
  };

  ThemeEngine.prototype.playActorState = function (actor, actorDef, prefix, desiredState) {
    if (!actor || !actorDef) return;
    const desired = resolveStateAsset(actorDef, desiredState);
    if (!desired) return;
    const textureKey = makeStateTextureKey(prefix, actorDef.id, desired.state);
    if (!this.scene.textures.exists(textureKey)) return;
    if (actor.texture.key !== textureKey) actor.setTexture(textureKey, 0);
    actor.setScale((typeof desired.asset.scale === 'number') ? desired.asset.scale : actorDef.scale);
    const animKey = textureKey + '_anim';
    if (this.scene.anims.exists(animKey)) {
      if (!actor.anims.isPlaying || !actor.anims.currentAnim || actor.anims.currentAnim.key !== animKey) {
        actor.anims.play(animKey, true);
      }
    } else {
      actor.anims.stop();
      actor.setFrame(0);
    }
  };

  ThemeEngine.prototype.resolveHeroDef = function (heroId) {
    if (heroId === this.runtime.mainHero.id) {
      return { actorDef: this.runtime.mainHero, prefix: 'main' };
    }
    const support = this.runtime.supportHeroes[heroId];
    if (!support) return null;
    return { actorDef: support, prefix: 'support' };
  };

  ThemeEngine.prototype.getActorByHeroId = function (heroId) {
    if (!heroId) return null;
    if (heroId === this.getMainHeroId()) {
      if (this.isChildSceneActive() && this.activeWorkerHeroId === heroId && this.childActor) return this.childActor;
      return this.mainActor || null;
    }
    if (this.isChildSceneActive() && this.activeWorkerHeroId === heroId && this.childActor) return this.childActor;
    return this.supportCast[heroId] || null;
  };

  ThemeEngine.prototype.getBaseScaleForHeroId = function (heroId) {
    const resolved = this.resolveHeroDef(heroId);
    if (!resolved || !resolved.actorDef) return 1.0;
    if (heroId === this.getMainHeroId()) {
      const mainNode = this.runtime.mainScene.cast[heroId];
      const desiredState = mainNode && mainNode.animationState ? mainNode.animationState : 'idle_a';
      const desired = resolveStateAsset(resolved.actorDef, desiredState) || resolveStateAsset(resolved.actorDef, 'idle_a');
      return desired && typeof desired.asset.scale === 'number' ? desired.asset.scale : resolved.actorDef.scale;
    }
    const castNode = this.runtime.mainScene.cast[heroId];
    const desiredState = castNode && castNode.animationState ? castNode.animationState : 'idle';
    const desired = resolveStateAsset(resolved.actorDef, desiredState) || resolveStateAsset(resolved.actorDef, 'idle');
    return desired && typeof desired.asset.scale === 'number' ? desired.asset.scale : resolved.actorDef.scale;
  };

  ThemeEngine.prototype.applyIdleEventEmphasis = function (heroId, options) {
    const actor = this.getActorByHeroId(heroId);
    if (!actor || this.sceneMode !== 'main_idle') return;
    const opts = options || {};
    const now = this.scene && this.scene.time ? this.scene.time.now : 0;
    this.idleEventEmphasis[heroId] = {
      tint: (opts.tint != null) ? Number(opts.tint) : 0xffe3a1,
      scaleBoost: Math.max(1, Number(opts.scaleBoost || 1.06)),
      expiresAt: now + Math.max(300, Number(opts.durationMs || 2600))
    };
    actor.clearTint();
    actor.setTint(this.idleEventEmphasis[heroId].tint);
  };

  ThemeEngine.prototype.clearIdleEventEmphasis = function (heroId) {
    if (!heroId) return;
    delete this.idleEventEmphasis[heroId];
    if (this.sceneMode !== 'main_idle') return;
    const actor = this.getActorByHeroId(heroId);
    if (!actor) return;
    actor.clearTint();
    actor.setScale(this.getBaseScaleForHeroId(heroId));
  };

  ThemeEngine.prototype.clearAllIdleEventEmphasis = function () {
    const heroIds = Object.keys(this.idleEventEmphasis);
    this.idleEventEmphasis = {};
    heroIds.forEach((heroId) => {
      const actor = this.getActorByHeroId(heroId);
      if (!actor) return;
      actor.clearTint();
      if (this.sceneMode === 'main_idle') actor.setScale(this.getBaseScaleForHeroId(heroId));
    });
  };

  ThemeEngine.prototype.getWorkerHeroIdForState = function (state) {
    if (state === 'idle') return this.runtime.mainHero.id;
    const subscene = this.runtime.subscenes[state];
    return subscene ? subscene.actorId : this.runtime.mainHero.id;
  };

  ThemeEngine.prototype.getHandoffDurationForState = function (state) {
    const subscene = this.runtime.subscenes[state];
    return subscene ? Math.max(0, Number(subscene.handoffDurationMs || 0)) : 0;
  };

  ThemeEngine.prototype.switchBackground = function (textureKey) {
    if (!this.bg || !this.scene.textures.exists(textureKey)) return;
    if (this.bg.texture.key !== textureKey) this.bg.setTexture(textureKey);
    this.fitBackground(this.bg);
  };

  ThemeEngine.prototype.setObjectListVisible = function (nodes, visible) {
    safeArray(nodes).forEach((node) => {
      if (!node) return;
      node.setVisible(visible);
    });
  };

  ThemeEngine.prototype.hideAllChildObjects = function () {
    Object.keys(this.childObjectsByState).forEach((state) => {
      this.setObjectListVisible(this.childObjectsByState[state], false);
    });
  };

  ThemeEngine.prototype.resetMainCastVisuals = function (options) {
    const opts = options || {};
    const runtime = this.runtime;
    const mainCast = runtime.mainScene.cast;

    this.mainActor.setVisible(true);
    this.mainActor.setAlpha(1);
    this.mainActor.clearTint();
    this.mainActor.setScale(runtime.mainHero.scale);
    const mainNode = mainCast[runtime.mainHero.id];
    if (mainNode) {
      this.mainActor.setPosition(mainNode.x, mainNode.y);
      this.mainActor.setDepth(typeof mainNode.depth === 'number' ? mainNode.depth : 240);
      this.playActorState(this.mainActor, runtime.mainHero, 'main', mainNode.animationState || 'idle_a');
    }

    Object.keys(runtime.supportHeroes).forEach((heroId) => {
      const heroDef = runtime.supportHeroes[heroId];
      const actor = this.supportCast[heroId];
      const castNode = mainCast[heroId];
      if (!actor || !castNode) return;
      actor.setVisible(true);
      actor.setAlpha(1);
      actor.clearTint();
      if (!opts.preserveSupportPositions) {
        actor.setPosition(castNode.x, castNode.y);
      }
      actor.setDepth(typeof castNode.depth === 'number' ? castNode.depth : heroDef.depth);
      this.playActorState(actor, heroDef, 'support', castNode.animationState || 'idle');
    });
  };

  ThemeEngine.prototype.enterMainIdle = function () {
    this.clearAllIdleEventEmphasis();
    this.sceneMode = 'main_idle';
    this.currentState = 'idle';
    this.activeWorkerHeroId = null;
    this.handoffTargetHeroId = null;
    this.currentSubscene = null;

    this.switchBackground('scene_bg_main');
    this.setObjectListVisible(this.mainObjects, true);
    this.hideAllChildObjects();
    this.childActor.setVisible(false);
    this.childActor.anims.stop();
    this.resetMainCastVisuals();

    this.hero = this.mainActor;
    this.heroBase = { x: this.mainActor.x, y: this.mainActor.y };
    this.target = { x: this.mainActor.x, y: this.mainActor.y };
    this.moving = false;
    this.resetSupportRoaming(this.scene && this.scene.time ? this.scene.time.now : 0);
    this.showFrontOverlayForScene('idle');
  };

  ThemeEngine.prototype.enterMainHandoff = function (state) {
    this.clearAllIdleEventEmphasis();
    const workerId = this.getWorkerHeroIdForState(state);
    this.sceneMode = 'main_handoff';
    this.currentState = state;
    this.activeWorkerHeroId = workerId;
    this.handoffTargetHeroId = workerId;
    this.currentSubscene = null;

    this.switchBackground('scene_bg_main');
    this.setObjectListVisible(this.mainObjects, true);
    this.hideAllChildObjects();
    this.childActor.setVisible(false);
    this.childActor.anims.stop();
    this.resetMainCastVisuals({ preserveSupportPositions: true });

    this.playActorState(this.mainActor, this.runtime.mainHero, 'main', 'idle_b');

    const dimAlpha = (typeof this.runtime.mainScene.handoff.dimAlpha === 'number')
      ? this.runtime.mainScene.handoff.dimAlpha
      : 0.42;

    Object.keys(this.supportCast).forEach((heroId) => {
      const actor = this.supportCast[heroId];
      if (!actor) return;
      actor.clearTint();
      actor.setAlpha(heroId === workerId ? 1 : dimAlpha);
    });

    if (workerId !== this.runtime.mainHero.id) {
      this.mainActor.setAlpha(1);
    }

    const targetActor = workerId === this.runtime.mainHero.id
      ? this.mainActor
      : this.supportCast[workerId];
    if (targetActor) {
      targetActor.setAlpha(1);
      targetActor.setTint(0xfff1a6);
    }

    this.hero = this.mainActor;
    this.heroBase = { x: this.mainActor.x, y: this.mainActor.y };
    this.target = { x: this.mainActor.x, y: this.mainActor.y };
    this.moving = false;
    this.setSupportRoamingEnabled(false, this.scene && this.scene.time ? this.scene.time.now : 0);
    this.showFrontOverlayForScene('idle');
  };

  ThemeEngine.prototype.enterChildScene = function (state) {
    this.clearAllIdleEventEmphasis();
    if (state === 'idle') {
      this.enterMainIdle();
      return;
    }

    const subscene = this.runtime.subscenes[state];
    if (!subscene) {
      this.enterMainIdle();
      return;
    }

    const resolved = this.resolveHeroDef(subscene.actorId);
    if (!resolved) {
      this.enterMainIdle();
      return;
    }

    this.sceneMode = 'child_active';
    this.currentState = state;
    this.activeWorkerHeroId = subscene.actorId;
    this.handoffTargetHeroId = null;
    this.currentSubscene = state;

    this.switchBackground('scene_bg_' + state);
    this.setObjectListVisible(this.mainObjects, false);
    this.hideAllChildObjects();
    this.setObjectListVisible(this.childObjectsByState[state], true);

    this.mainActor.setVisible(false);
    Object.keys(this.supportCast).forEach((heroId) => {
      const actor = this.supportCast[heroId];
      if (actor) actor.setVisible(false);
    });

    this.childActor.setVisible(true);
    this.childActor.setPosition(subscene.x, subscene.y);
    this.childActor.setDepth(subscene.depth);
    this.childActor.setOrigin(resolved.actorDef.origin.x, resolved.actorDef.origin.y);
    this.playActorState(this.childActor, resolved.actorDef, resolved.prefix, subscene.animationState);

    this.hero = this.childActor;
    this.heroBase = { x: this.childActor.x, y: this.childActor.y };
    this.target = { x: this.childActor.x, y: this.childActor.y };
    this.moving = false;
    this.setSupportRoamingEnabled(false, this.scene && this.scene.time ? this.scene.time.now : 0);
    this.queueFrontOverlayLoad(state);
    this.showFrontOverlayForScene(state);
  };

  ThemeEngine.prototype.setTargetForState = function (state, options) {
    const nextState = state || 'idle';
    const opts = options || {};
    const phase = opts.phase || (nextState === 'idle' ? 'main_idle' : 'child');

    if (nextState === 'idle' || phase === 'main_idle') {
      this.enterMainIdle();
      return;
    }
    if (phase === 'handoff') {
      this.enterMainHandoff(nextState);
      return;
    }
    this.enterChildScene(nextState);
  };

  ThemeEngine.prototype.getMainRole = function () {
    return this.runtime.mainHero ? this.runtime.mainHero.role : null;
  };

  ThemeEngine.prototype.getMainHeroId = function () {
    return this.runtime.mainHero ? this.runtime.mainHero.id : null;
  };

  ThemeEngine.prototype.getCurrentWorkerHeroId = function () {
    return this.activeWorkerHeroId || null;
  };

  ThemeEngine.prototype.isChildSceneActive = function () {
    return this.sceneMode === 'child_active';
  };

  ThemeEngine.prototype.getPreferredAudioRole = function () {
    if (this.sceneMode === 'child_active' && this.activeWorkerHeroId) {
      const resolved = this.resolveHeroDef(this.activeWorkerHeroId);
      if (resolved && resolved.actorDef && resolved.actorDef.role) return resolved.actorDef.role;
    }
    return this.getMainRole();
  };

  ThemeEngine.prototype.getActiveSupportHeroId = function () {
    if (!this.isChildSceneActive()) return null;
    if (this.activeWorkerHeroId === this.getMainHeroId()) return null;
    return this.activeWorkerHeroId || null;
  };

  ThemeEngine.prototype.hasVisibleSupportHero = function () {
    return !!(this.isChildSceneActive() && this.getActiveSupportHeroId() && this.childActor && this.childActor.visible);
  };

  ThemeEngine.prototype.getActorForSpeaker = function (speaker) {
    if (speaker === 'support') {
      if (this.hasVisibleSupportHero()) return this.childActor;
      return null;
    }
    if (this.isChildSceneActive() && this.activeWorkerHeroId === this.getMainHeroId()) {
      return this.childActor || this.mainActor;
    }
    return this.mainActor || this.hero || null;
  };

  ThemeEngine.prototype.getDebugSceneState = function () {
    const countVisible = (nodes) => safeArray(nodes).filter((node) => node && node.visible).length;
    const currentChildNodes = this.currentSubscene ? this.childObjectsByState[this.currentSubscene] : [];
    const roamingDebug = {};
    Object.keys(this.supportRoamingState).forEach((heroId) => {
      const state = this.supportRoamingState[heroId];
      if (!state) return;
      roamingDebug[heroId] = {
        baseX: Number(state.baseX.toFixed(2)),
        baseY: Number(state.baseY.toFixed(2)),
        target: state.target ? {
          x: Number(state.target.x.toFixed(2)),
          y: Number(state.target.y.toFixed(2))
        } : null,
        pauseUntil: Number(state.pauseUntil.toFixed(2)),
        nextDecisionAt: Number(state.nextDecisionAt.toFixed(2)),
        speedPxPerSec: Number(state.speedPxPerSec.toFixed(2)),
        bounds: {
          left: Number(state.bounds.left.toFixed(2)),
          right: Number(state.bounds.right.toFixed(2)),
          top: Number(state.bounds.top.toFixed(2)),
          bottom: Number(state.bounds.bottom.toFixed(2))
        }
      };
    });
    return {
      sceneMode: this.sceneMode,
      currentSubscene: this.currentSubscene,
      frontOverlay: {
        activeOwnerKey: this.activeFrontOverlayOwner,
        loadedOwners: Object.keys(this.loadedFrontOverlayOwners).sort(),
        failedOwners: Object.keys(this.failedFrontOverlayOwners).sort(),
        frameIndex: this.frontOverlayFrameIndex,
        visible: !!(this.frontOverlayNode && this.frontOverlayNode.visible)
      },
      supportRoamingEnabled: this.supportRoamingEnabled,
      supportRoamingDebug: roamingDebug,
      mainObjectCount: safeArray(this.mainObjects).length,
      visibleMainObjectCount: countVisible(this.mainObjects),
      currentChildObjectCount: safeArray(currentChildNodes).length,
      visibleChildObjectCount: countVisible(currentChildNodes)
    };
  };

  ThemeEngine.prototype.update = function (time, delta) {
    for (let i = this.objectBubbles.length - 1; i >= 0; i--) {
      const bubble = this.objectBubbles[i];
      if (bubble && bubble.t && time > bubble.t) {
        if (bubble.node) bubble.node.destroy();
        this.objectBubbles.splice(i, 1);
      }
    }

    if (this.sceneMode === 'main_idle') {
      Object.keys(this.idleEventEmphasis).forEach((heroId) => {
        const emphasis = this.idleEventEmphasis[heroId];
        const actor = this.getActorByHeroId(heroId);
        if (!emphasis || !actor) {
          delete this.idleEventEmphasis[heroId];
          return;
        }
        if (time > emphasis.expiresAt) {
          this.clearIdleEventEmphasis(heroId);
          return;
        }
        const baseScale = this.getBaseScaleForHeroId(heroId);
        const pulse = (Math.sin(time * 0.01) + 1) * 0.5;
        actor.setScale(baseScale * (1 + (emphasis.scaleBoost - 1) * pulse));
        actor.setTint(emphasis.tint);
      });

      this.updateSupportRoaming(time, delta);
    }

    if (this.sceneMode === 'main_handoff' && this.handoffTargetHeroId && this.handoffTargetHeroId !== this.runtime.mainHero.id) {
      const actor = this.supportCast[this.handoffTargetHeroId];
      const heroDef = this.runtime.supportHeroes[this.handoffTargetHeroId];
      if (actor && heroDef) {
        const baseScale = heroDef.states && heroDef.states.idle && typeof heroDef.states.idle.scale === 'number'
          ? heroDef.states.idle.scale
          : heroDef.scale;
        const extraScale = (typeof this.runtime.mainScene.handoff.targetScale === 'number')
          ? this.runtime.mainScene.handoff.targetScale
          : 1.08;
        actor.setScale(baseScale * (1 + (extraScale - 1) * ((Math.sin(time * 0.01) + 1) * 0.5)));
      }
    }

    if (this.sceneMode === 'main_handoff' && this.handoffTargetHeroId === this.runtime.mainHero.id && this.mainActor) {
      const desired = resolveStateAsset(this.runtime.mainHero, 'idle_b') || resolveStateAsset(this.runtime.mainHero, 'idle_a');
      const baseScale = desired && typeof desired.asset.scale === 'number'
        ? desired.asset.scale
        : this.runtime.mainHero.scale;
      const extraScale = (typeof this.runtime.mainScene.handoff.targetScale === 'number')
        ? this.runtime.mainScene.handoff.targetScale
        : 1.04;
      this.mainActor.setScale(baseScale * (1 + (extraScale - 1) * ((Math.sin(time * 0.01) + 1) * 0.5)));
    }

    this.updateFrontOverlay(time);
  };

  if (typeof roamingApi.applyRoamingAPI === 'function') {
    roamingApi.applyRoamingAPI(ThemeEngine);
  }

  window.StarOfficeThemeEngine = {
    ThemeEngine: ThemeEngine,
    resolveAssetUrl: resolveAssetUrl
  };
})();
