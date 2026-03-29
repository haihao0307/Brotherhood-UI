(function () {
  'use strict';

  const KNOWN_STATES = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function normalizeOrigin(o, fallback) {
    if (!o || typeof o !== 'object') return fallback;
    const x = (typeof o.x === 'number') ? o.x : fallback.x;
    const y = (typeof o.y === 'number') ? o.y : fallback.y;
    return { x, y };
  }

  function parseTint(t) {
    if (!t) return null;
    if (typeof t === 'number') return t;
    if (typeof t === 'string') {
      if (t.startsWith('0x')) return parseInt(t, 16);
      return parseInt(t, 10);
    }
    return null;
  }

  function safeArray(v) { return Array.isArray(v) ? v : []; }

  function resolveAssetUrl(asset, version, supportsWebP) {
    if (!asset) return null;
    if (supportsWebP && asset.webp) return asset.webp + '?v=' + version;
    if (asset.png) return asset.png + '?v=' + version;
    if (asset.webp) return asset.webp + '?v=' + version;
    return null;
  }

  function normalizeSpriteAsset(asset, fallbackScale) {
    if (!asset || typeof asset !== 'object') return null;
    if (typeof asset.frameWidth !== 'number' || typeof asset.frameHeight !== 'number') return null;
    return {
      png: asset.png || null,
      webp: asset.webp || null,
      frameWidth: Number(asset.frameWidth),
      frameHeight: Number(asset.frameHeight),
      frames: Math.max(1, Number(asset.frames || 1)),
      frameRate: Math.max(1, Number(asset.frameRate || 6)),
      scale: (typeof asset.scale === 'number') ? asset.scale : fallbackScale,
      loop: asset.loop !== false
    };
  }

  function defaultLegacyPositions() {
    return {
      idle: { x: 640, y: 600 },
      writing: { x: 320, y: 520 },
      researching: { x: 320, y: 520 },
      executing: { x: 320, y: 520 },
      syncing: { x: 640, y: 620 },
      error: { x: 1066, y: 360 }
    };
  }

  function normalizeSlotMap(slots) {
    const out = {};
    if (!slots || typeof slots !== 'object') return out;
    Object.keys(slots).forEach((key) => {
      const node = slots[key];
      if (!node || typeof node !== 'object') return;
      if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
      out[key] = { x: Number(node.x), y: Number(node.y) };
    });
    return out;
  }

  function buildLegacyRuntime(themeConfig) {
    const legacyPositions = Object.assign(defaultLegacyPositions(), themeConfig && themeConfig.positions ? themeConfig.positions : {});
    const hero = (themeConfig && themeConfig.hero) ? themeConfig.hero : {};
    const baseScale = (typeof hero.scale === 'number') ? hero.scale : 1.0;
    const origin = normalizeOrigin(hero.origin, { x: 0.5, y: 1.0 });
    const walking = normalizeSpriteAsset(themeConfig && themeConfig.assets && themeConfig.assets.hero, baseScale);
    const heroStates = (themeConfig && themeConfig.assets && themeConfig.assets.heroStates && typeof themeConfig.assets.heroStates === 'object')
      ? themeConfig.assets.heroStates
      : {};
    const states = {};

    Object.keys(heroStates).forEach((state) => {
      const asset = normalizeSpriteAsset(heroStates[state], baseScale);
      if (asset) states[state] = asset;
    });

    if (!states.idle && walking) states.idle = walking;
    if (!states.idle_a && states.idle) states.idle_a = states.idle;
    if (!states.idle_b && states.idle) states.idle_b = states.idle;
    if (!states.researching && states.idle) states.researching = states.idle;

    const slots = {
      mainHome: legacyPositions.idle || { x: 640, y: 600 },
      mainCommand: legacyPositions.syncing || legacyPositions.idle || { x: 640, y: 600 },
      mainResearch: legacyPositions.researching || legacyPositions.idle || { x: 640, y: 600 },
      supportWriting: legacyPositions.writing || legacyPositions.idle || { x: 640, y: 600 },
      supportExecuting: legacyPositions.executing || legacyPositions.idle || { x: 640, y: 600 },
      supportSyncing: legacyPositions.syncing || legacyPositions.idle || { x: 640, y: 600 },
      supportError: legacyPositions.error || legacyPositions.idle || { x: 640, y: 600 }
    };

    const scenes = {
      idle: { mainSlot: 'mainHome', mainAnimation: 'idle_a', supportVisible: false },
      writing: { mainSlot: 'supportWriting', mainAnimation: 'writing', supportVisible: false },
      researching: { mainSlot: 'mainResearch', mainAnimation: 'researching', supportVisible: false },
      executing: { mainSlot: 'supportExecuting', mainAnimation: 'executing', supportVisible: false },
      syncing: { mainSlot: 'supportSyncing', mainAnimation: 'syncing', supportVisible: false },
      error: { mainSlot: 'supportError', mainAnimation: 'error', supportVisible: false }
    };

    return {
      assets: (themeConfig && themeConfig.assets) ? themeConfig.assets : {},
      effects: (themeConfig && themeConfig.effects) ? themeConfig.effects : {},
      objects: safeArray(themeConfig && themeConfig.objects),
      slots: slots,
      scenes: scenes,
      mainHero: {
        id: String(hero.id || hero.role || 'main'),
        role: String(hero.role || hero.id || 'main'),
        origin: origin,
        scale: baseScale,
        walking: walking,
        states: states
      },
      supportHeroes: {}
    };
  }

  function buildConfiguredRuntime(themeConfig) {
    const cfg = themeConfig || {};
    const mainCfg = (cfg.mainHero && typeof cfg.mainHero === 'object') ? cfg.mainHero : {};
    const fallbackHero = (cfg.hero && typeof cfg.hero === 'object') ? cfg.hero : {};
    const mainScale = (typeof mainCfg.scale === 'number') ? mainCfg.scale : ((typeof fallbackHero.scale === 'number') ? fallbackHero.scale : 1.0);
    const mainOrigin = normalizeOrigin(mainCfg.origin || fallbackHero.origin, { x: 0.5, y: 1.0 });
    const mainStatesRaw = (mainCfg.states && typeof mainCfg.states === 'object') ? mainCfg.states : {};
    const mainStates = {};

    Object.keys(mainStatesRaw).forEach((key) => {
      const asset = normalizeSpriteAsset(mainStatesRaw[key], mainScale);
      if (asset) mainStates[key] = asset;
    });

    if (!mainStates.idle && cfg.assets && cfg.assets.heroStates && cfg.assets.heroStates.idle) {
      mainStates.idle = normalizeSpriteAsset(cfg.assets.heroStates.idle, mainScale);
    }
    if (!mainStates.idle_a && mainStates.idle) mainStates.idle_a = mainStates.idle;
    if (!mainStates.idle_b && mainStates.idle) mainStates.idle_b = mainStates.idle;
    if (!mainStates.researching && cfg.assets && cfg.assets.heroStates && cfg.assets.heroStates.researching) {
      mainStates.researching = normalizeSpriteAsset(cfg.assets.heroStates.researching, mainScale);
    }

    const walking = normalizeSpriteAsset(mainCfg.walking || (cfg.assets && cfg.assets.hero), mainScale);
    const supportHeroes = {};
    const supportCfg = (cfg.supportHeroes && typeof cfg.supportHeroes === 'object') ? cfg.supportHeroes : {};

    Object.keys(supportCfg).forEach((heroId) => {
      const node = supportCfg[heroId];
      if (!node || typeof node !== 'object') return;
      const scale = (typeof node.scale === 'number') ? node.scale : 1.0;
      const states = {};
      const rawStates = (node.states && typeof node.states === 'object') ? node.states : {};
      Object.keys(rawStates).forEach((state) => {
        const asset = normalizeSpriteAsset(rawStates[state], scale);
        if (asset) states[state] = asset;
      });
      if (!states.idle) {
        const firstState = Object.keys(states)[0];
        if (firstState) states.idle = states[firstState];
      }
      supportHeroes[heroId] = {
        id: heroId,
        label: String(node.label || heroId),
        role: String(node.role || heroId),
        origin: normalizeOrigin(node.origin, { x: 0.5, y: 1.0 }),
        scale: scale,
        states: states,
        depth: (typeof node.depth === 'number') ? node.depth : 120
      };
    });

    const scenes = {};
    const rawScenes = (cfg.stateScenes && typeof cfg.stateScenes === 'object') ? cfg.stateScenes : {};
    KNOWN_STATES.forEach((state) => {
      const node = (rawScenes[state] && typeof rawScenes[state] === 'object') ? rawScenes[state] : {};
      scenes[state] = {
        mainSlot: String(node.mainSlot || 'mainHome'),
        mainAnimation: String(node.mainAnimation || (state === 'idle' ? 'idle_a' : state)),
        supportVisible: node.supportVisible === true,
        supportHero: node.supportHero ? String(node.supportHero) : null,
        supportSlot: String(node.supportSlot || 'supportWriting'),
        supportAnimation: String(node.supportAnimation || 'idle')
      };
    });
    if (!scenes.idle) scenes.idle = { mainSlot: 'mainHome', mainAnimation: 'idle_a', supportVisible: false };

    return {
      assets: (cfg.assets && typeof cfg.assets === 'object') ? cfg.assets : {},
      effects: (cfg.effects && typeof cfg.effects === 'object') ? cfg.effects : {},
      objects: safeArray(cfg.objects),
      slots: normalizeSlotMap(cfg.slots),
      scenes: scenes,
      mainHero: {
        id: String(mainCfg.id || mainCfg.role || fallbackHero.id || fallbackHero.role || 'songjiang'),
        role: String(mainCfg.role || fallbackHero.role || 'songjiang'),
        origin: mainOrigin,
        scale: mainScale,
        walking: walking,
        states: mainStates
      },
      supportHeroes: supportHeroes
    };
  }

  function buildRuntimeTheme(themeConfig) {
    if (themeConfig && themeConfig.mainHero) return buildConfiguredRuntime(themeConfig);
    return buildLegacyRuntime(themeConfig);
  }

  function getEffect(runtime, state) {
    const effects = runtime && runtime.effects;
    const e = effects && effects[state];
    if (!e) return { tint: null, shake: 0.0, bob: 0.0 };
    return {
      tint: parseTint(e.tint),
      shake: Number(e.shake || 0),
      bob: Number(e.bob || 0)
    };
  }

  function resolveStateAsset(actorDef, desiredState) {
    if (!actorDef || !actorDef.states) return null;
    const states = actorDef.states;
    if (desiredState && states[desiredState]) return { state: desiredState, asset: states[desiredState] };
    if (desiredState === 'idle_a' && states.idle) return { state: 'idle', asset: states.idle };
    if (desiredState === 'idle_b' && states.idle) return { state: 'idle', asset: states.idle };
    if (desiredState && desiredState !== 'idle' && states.idle) return { state: 'idle', asset: states.idle };
    const firstState = Object.keys(states)[0];
    if (!firstState) return null;
    return { state: firstState, asset: states[firstState] };
  }

  function makeStateTextureKey(prefix, actorId, state) {
    return prefix + '_' + actorId + '_' + state;
  }

  function makeWalkTextureKey(actorId) {
    return 'walk_' + actorId;
  }

  function getSlot(runtime, slotId, fallback) {
    const slot = runtime && runtime.slots && runtime.slots[slotId];
    if (slot && typeof slot.x === 'number' && typeof slot.y === 'number') return slot;
    return fallback || { x: 640, y: 600 };
  }

  function ThemeEngine(themeConfig, opts) {
    this.themeConfig = themeConfig || {};
    this.runtime = buildRuntimeTheme(themeConfig);
    this.version = (opts && opts.version) || '0';
    this.supportsWebP = !!(opts && opts.supportsWebP);

    this.scene = null;
    this.bg = null;
    this.bgFg = null;
    this.objects = [];
    this.objectBubbles = [];

    this.mainActor = null;
    this.supportActor = null;
    this.hero = null;

    this.heroBase = { x: 640, y: 600 };
    this.target = { x: 640, y: 600 };
    this.moving = false;

    this.currentState = 'idle';
    this.currentScene = this.runtime.scenes.idle || { mainSlot: 'mainHome', mainAnimation: 'idle_a', supportVisible: false };
    this.activeSupportHeroId = null;
    this.supportVisible = false;
  }

  ThemeEngine.prototype.preload = function (scene) {
    this.scene = scene;
    const runtime = this.runtime;
    const ver = this.version;
    const sw = this.supportsWebP;

    const bgUrl = resolveAssetUrl(runtime.assets && runtime.assets.bg, ver, sw);
    if (bgUrl) scene.load.image('bg', bgUrl);

    const bgFgUrl = resolveAssetUrl(runtime.assets && runtime.assets.bgFg, ver, sw);
    if (bgFgUrl) scene.load.image('bg_fg', bgFgUrl);

    const mainHero = runtime.mainHero;
    if (mainHero && mainHero.walking) {
      const walkUrl = resolveAssetUrl(mainHero.walking, ver, sw);
      if (walkUrl) {
        scene.load.spritesheet(makeWalkTextureKey(mainHero.id), walkUrl, {
          frameWidth: mainHero.walking.frameWidth,
          frameHeight: mainHero.walking.frameHeight
        });
      }
    }

    const mainStates = (mainHero && mainHero.states) ? mainHero.states : {};
    Object.keys(mainStates).forEach((state) => {
      const asset = mainStates[state];
      const url = resolveAssetUrl(asset, ver, sw);
      if (!url) return;
      scene.load.spritesheet(makeStateTextureKey('main', mainHero.id, state), url, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight
      });
    });

    const supportHeroes = runtime.supportHeroes || {};
    Object.keys(supportHeroes).forEach((heroId) => {
      const heroDef = supportHeroes[heroId];
      const states = heroDef.states || {};
      Object.keys(states).forEach((state) => {
        const asset = states[state];
        const url = resolveAssetUrl(asset, ver, sw);
        if (!url) return;
        scene.load.spritesheet(makeStateTextureKey('support', heroId, state), url, {
          frameWidth: asset.frameWidth,
          frameHeight: asset.frameHeight
        });
      });
    });

    const sheets = (runtime.assets && runtime.assets.spritesheets) ? runtime.assets.spritesheets : {};
    Object.keys(sheets).forEach((key) => {
      const sh = sheets[key];
      const url = resolveAssetUrl(sh, ver, sw);
      if (!url) return;
      scene.load.spritesheet('ss_' + key, url, {
        frameWidth: sh.frameWidth,
        frameHeight: sh.frameHeight
      });
    });
  };

  ThemeEngine.prototype.create = function (scene) {
    this.scene = scene;
    const runtime = this.runtime;
    const mainHero = runtime.mainHero;

    this.bg = scene.add.image(640, 360, 'bg').setOrigin(0.5);
    const scaleX = 1280 / this.bg.width;
    const scaleY = 720 / this.bg.height;
    this.bg.setScale(Math.max(scaleX, scaleY));
    this.bg.setDepth(0);

    const home = getSlot(runtime, 'mainHome', { x: 640, y: 600 });
    this.target = { x: home.x, y: home.y };
    this.heroBase = { x: home.x, y: home.y };

    this.initMainActor(scene, mainHero);
    this.initSupportActor(scene);

    this.createObjectsFromTheme(scene);

    if (scene.textures.exists('bg_fg')) {
      this.bgFg = scene.add.image(640, 360, 'bg_fg').setOrigin(0.5);
      this.bgFg.setScale(this.bg.scaleX, this.bg.scaleY);
      this.bgFg.setDepth(1000);
    }
  };

  ThemeEngine.prototype.initMainActor = function (scene, mainHero) {
    const walkTextureKey = makeWalkTextureKey(mainHero.id);
    const firstState = resolveStateAsset(mainHero, 'idle_a') || resolveStateAsset(mainHero, 'idle');
    const initialTextureKey = scene.textures.exists(walkTextureKey)
      ? walkTextureKey
      : (firstState ? makeStateTextureKey('main', mainHero.id, firstState.state) : null);

    this.mainActor = scene.add.sprite(this.heroBase.x, this.heroBase.y, initialTextureKey || '__MISSING').setOrigin(mainHero.origin.x, mainHero.origin.y);
    this.mainActor.setScale(mainHero.scale);
    this.mainActor.setDepth(100);
    this.hero = this.mainActor;

    if (mainHero.walking && scene.textures.exists(walkTextureKey) && !scene.anims.exists('main_walk_' + mainHero.id)) {
      scene.anims.create({
        key: 'main_walk_' + mainHero.id,
        frames: scene.anims.generateFrameNumbers(walkTextureKey, { start: 0, end: Math.max(0, mainHero.walking.frames - 1) }),
        frameRate: mainHero.walking.frameRate,
        repeat: -1
      });
    }

    this.initStateAnimations(scene, 'main', mainHero.id, mainHero.states);
  };

  ThemeEngine.prototype.initSupportActor = function (scene) {
    const supportHeroIds = Object.keys(this.runtime.supportHeroes || {});
    const firstHeroId = supportHeroIds[0];
    const firstHero = firstHeroId ? this.runtime.supportHeroes[firstHeroId] : null;
    const firstState = firstHero ? (resolveStateAsset(firstHero, 'idle') || resolveStateAsset(firstHero, null)) : null;
    const initialTextureKey = (firstHero && firstState)
      ? makeStateTextureKey('support', firstHero.id, firstState.state)
      : (this.mainActor ? this.mainActor.texture.key : '__MISSING');
    const origin = firstHero ? firstHero.origin : { x: 0.5, y: 1.0 };
    const scale = firstHero ? firstHero.scale : 1.0;

    this.supportActor = scene.add.sprite(this.heroBase.x, this.heroBase.y, initialTextureKey || '__MISSING').setOrigin(origin.x, origin.y);
    this.supportActor.setScale(scale);
    this.supportActor.setVisible(false);
    this.supportActor.setDepth(firstHero ? firstHero.depth : 120);

    supportHeroIds.forEach((heroId) => {
      const heroDef = this.runtime.supportHeroes[heroId];
      this.initStateAnimations(scene, 'support', heroId, heroDef.states);
    });
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

  ThemeEngine.prototype.createObjectsFromTheme = function (scene) {
    const runtime = this.runtime;
    const objects = safeArray(runtime.objects);
    const sheets = (runtime.assets && runtime.assets.spritesheets) ? runtime.assets.spritesheets : {};
    const bubbles = this.objectBubbles;

    const ensureAnim = (key, sh) => {
      const animKey = 'anim_' + key;
      if (scene.anims.exists(animKey)) return animKey;
      const frames = (sh && sh.frames) ? Number(sh.frames) : 1;
      const fr = (sh && sh.frameRate) ? Number(sh.frameRate) : 6;
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers('ss_' + key, { start: 0, end: Math.max(0, frames - 1) }),
        frameRate: fr,
        repeat: -1
      });
      return animKey;
    };

    for (const o of objects) {
      if (!o || typeof o !== 'object') continue;
      const type = o.type || 'animated';
      const depth = (typeof o.depth === 'number') ? o.depth : 50;
      const scale = (typeof o.scale === 'number') ? o.scale : 1.0;
      const origin = normalizeOrigin(o.origin, { x: 0.5, y: 1.0 });

      if (type === 'animated') {
        const key = o.key;
        const sh = sheets[key];
        if (!key || !sh) continue;
        if (!scene.textures.exists('ss_' + key)) continue;

        const animKey = ensureAnim(key, sh);
        const sp = scene.add.sprite(o.x || 0, o.y || 0, 'ss_' + key, 0).setOrigin(origin.x, origin.y);
        sp.setScale(scale);
        sp.setDepth(depth);
        sp.anims.play(animKey, true);

        if (o.clickText) {
          sp.setInteractive({ useHandCursor: true });
          sp.on('pointerdown', () => {
            const b = scene.add.text(sp.x, sp.y - 20, String(o.clickText), {
              fontFamily: 'ArkPixel, monospace',
              fontSize: '12px',
              color: '#111',
              backgroundColor: '#fff7d6',
              padding: { x: 6, y: 4 }
            }).setOrigin(0.5, 1.0);
            b.setDepth(2000);
            bubbles.push({ t: scene.time.now + 2200, node: b });
          });
        }

        this.objects.push(sp);
      }
    }
  };

  ThemeEngine.prototype.getSceneForState = function (state) {
    const scenes = this.runtime.scenes || {};
    return scenes[state] || scenes.idle || { mainSlot: 'mainHome', mainAnimation: 'idle_a', supportVisible: false };
  };

  ThemeEngine.prototype.setTargetForState = function (state) {
    this.currentState = state || 'idle';
    this.currentScene = this.getSceneForState(this.currentState);
    const slot = getSlot(this.runtime, this.currentScene.mainSlot, this.heroBase);
    this.target = { x: slot.x, y: slot.y };

    if (!this.currentScene.supportVisible) {
      this.hideSupportActor();
    } else {
      this.supportVisible = false;
      if (this.supportActor) this.supportActor.setVisible(false);
      this.activeSupportHeroId = this.currentScene.supportHero || null;
    }
  };

  ThemeEngine.prototype.getMainRole = function () {
    return this.runtime.mainHero ? this.runtime.mainHero.role : null;
  };

  ThemeEngine.prototype.getPreferredAudioRole = function () {
    if (this.currentScene && this.currentScene.supportVisible && this.supportVisible && this.activeSupportHeroId) {
      const heroDef = this.runtime.supportHeroes && this.runtime.supportHeroes[this.activeSupportHeroId];
      if (heroDef && heroDef.role) return heroDef.role;
    }
    return this.getMainRole();
  };

  ThemeEngine.prototype.getActiveSupportHeroId = function () {
    return this.activeSupportHeroId || null;
  };

  ThemeEngine.prototype.hasVisibleSupportHero = function () {
    return !!(this.supportVisible && this.supportActor && this.supportActor.visible);
  };

  ThemeEngine.prototype.getActorForSpeaker = function (speaker) {
    if (speaker === 'support') {
      if (this.hasVisibleSupportHero()) return this.supportActor;
      return null;
    }
    return this.mainActor || this.hero || null;
  };

  ThemeEngine.prototype.hideSupportActor = function () {
    this.supportVisible = false;
    this.activeSupportHeroId = null;
    if (!this.supportActor) return;
    this.supportActor.setVisible(false);
    this.supportActor.anims.stop();
  };

  ThemeEngine.prototype.applyMainVisual = function () {
    if (!this.mainActor) return;
    const mainHero = this.runtime.mainHero;
    const walkTextureKey = makeWalkTextureKey(mainHero.id);

    if (this.moving && mainHero.walking && this.scene.textures.exists(walkTextureKey)) {
      if (this.mainActor.texture.key !== walkTextureKey) this.mainActor.setTexture(walkTextureKey, 0);
      this.mainActor.setScale(mainHero.scale);
      const walkAnimKey = 'main_walk_' + mainHero.id;
      if (this.scene.anims.exists(walkAnimKey) && (!this.mainActor.anims.isPlaying || this.mainActor.anims.currentAnim?.key !== walkAnimKey)) {
        this.mainActor.anims.play(walkAnimKey, true);
      }
      return;
    }

    const desired = resolveStateAsset(mainHero, this.currentScene.mainAnimation || 'idle_a');
    if (!desired) return;
    const textureKey = makeStateTextureKey('main', mainHero.id, desired.state);
    if (!this.scene.textures.exists(textureKey)) return;
    if (this.mainActor.texture.key !== textureKey) this.mainActor.setTexture(textureKey, 0);
    this.mainActor.setScale((typeof desired.asset.scale === 'number') ? desired.asset.scale : mainHero.scale);
    const animKey = textureKey + '_anim';
    if (this.scene.anims.exists(animKey)) {
      if (!this.mainActor.anims.isPlaying || this.mainActor.anims.currentAnim?.key !== animKey) {
        this.mainActor.anims.play(animKey, true);
      }
    } else {
      this.mainActor.anims.stop();
      this.mainActor.setFrame(0);
    }
  };

  ThemeEngine.prototype.applySupportVisual = function () {
    if (!this.supportActor || !this.currentScene || !this.currentScene.supportVisible || this.moving) {
      if (this.supportActor) this.supportActor.setVisible(false);
      this.supportVisible = false;
      return;
    }

    const heroId = this.currentScene.supportHero;
    const heroDef = heroId ? this.runtime.supportHeroes[heroId] : null;
    if (!heroDef) {
      this.supportActor.setVisible(false);
      this.supportVisible = false;
      return;
    }

    const desired = resolveStateAsset(heroDef, this.currentScene.supportAnimation || 'idle');
    if (!desired) {
      this.supportActor.setVisible(false);
      this.supportVisible = false;
      return;
    }

    const slot = getSlot(this.runtime, this.currentScene.supportSlot, this.heroBase);
    const textureKey = makeStateTextureKey('support', heroDef.id, desired.state);
    if (!this.scene.textures.exists(textureKey)) {
      this.supportActor.setVisible(false);
      this.supportVisible = false;
      return;
    }

    this.activeSupportHeroId = heroId;
    this.supportActor.setVisible(true);
    this.supportActor.setPosition(slot.x, slot.y);
    this.supportActor.setOrigin(heroDef.origin.x, heroDef.origin.y);
    this.supportActor.setDepth(heroDef.depth);
    this.supportActor.setScale((typeof desired.asset.scale === 'number') ? desired.asset.scale : heroDef.scale);
    if (this.supportActor.texture.key !== textureKey) this.supportActor.setTexture(textureKey, 0);

    const animKey = textureKey + '_anim';
    if (this.scene.anims.exists(animKey)) {
      if (!this.supportActor.anims.isPlaying || this.supportActor.anims.currentAnim?.key !== animKey) {
        this.supportActor.anims.play(animKey, true);
      }
    } else {
      this.supportActor.anims.stop();
      this.supportActor.setFrame(0);
    }

    this.supportVisible = true;
  };

  ThemeEngine.prototype.setMoving = function (isMoving) {
    this.moving = !!isMoving;
  };

  ThemeEngine.prototype.shouldApplyMainStateEffects = function () {
    const scene = this.currentScene;
    if (!scene || typeof scene !== 'object') return true;
    // Legacy themes rely on main-hero tint/shake for syncing/error when no support hero exists.
    if (scene.supportVisible === true && scene.supportHero) return false;
    return true;
  };

  ThemeEngine.prototype.applyStateEffects = function (state, t) {
    if (!this.mainActor) return;
    if (!this.shouldApplyMainStateEffects()) {
      this.mainActor.clearTint();
      this.mainActor.x = this.heroBase.x;
      this.mainActor.y = this.heroBase.y;
      return;
    }
    const eff = getEffect(this.runtime, state);
    if (eff.tint) this.mainActor.setTint(eff.tint); else this.mainActor.clearTint();

    this.mainActor.x = this.heroBase.x;
    this.mainActor.y = this.heroBase.y;

    if (!this.moving) {
      const shake = eff.shake || 0;
      const bob = eff.bob || 0;
      if (shake > 0) {
        this.mainActor.x += Math.sin(t * 0.03) * shake;
        this.mainActor.y += Math.cos(t * 0.025) * shake;
      }
      if (bob > 0) {
        this.mainActor.y += Math.sin(t * 0.02) * bob;
      }
    }
  };

  ThemeEngine.prototype.update = function (time, delta, state) {
    if (!this.mainActor) return;
    if (state && state !== this.currentState) this.setTargetForState(state);

    for (let i = this.objectBubbles.length - 1; i >= 0; i--) {
      const b = this.objectBubbles[i];
      if (b && b.t && time > b.t) {
        if (b.node) b.node.destroy();
        this.objectBubbles.splice(i, 1);
      }
    }

    const speed = 240;
    const dx = this.target.x - this.heroBase.x;
    const dy = this.target.y - this.heroBase.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 2.0) {
      if (dx < -1) this.mainActor.setFlipX(true);
      if (dx > 1) this.mainActor.setFlipX(false);
      this.setMoving(true);
      const step = (speed * delta) / 1000.0;
      const k = Math.min(1.0, step / dist);
      this.heroBase.x += dx * k;
      this.heroBase.y += dy * k;
    } else {
      this.heroBase.x = this.target.x;
      this.heroBase.y = this.target.y;
      this.setMoving(false);
    }

    this.applyMainVisual();
    this.applyStateEffects(this.currentState, time);
    this.applySupportVisual();
  };

  window.StarOfficeThemeEngine = {
    ThemeEngine: ThemeEngine,
    resolveAssetUrl: resolveAssetUrl
  };
})();
