(function () {
  'use strict';

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randFloat(min, max) {
    const a = Number(min || 0);
    const b = Number(max || a);
    if (a === b) return a;
    return a + Math.random() * (b - a);
  }

  function normalizeOrigin(origin, fallback) {
    if (!origin || typeof origin !== 'object') return fallback;
    return {
      x: (typeof origin.x === 'number') ? origin.x : fallback.x,
      y: (typeof origin.y === 'number') ? origin.y : fallback.y
    };
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach((key) => {
        out[key] = cloneValue(value[key]);
      });
      return out;
    }
    return value;
  }

  function applyObjectOverrides(baseObject, overrides) {
    const merged = cloneValue(baseObject);
    if (!overrides || typeof overrides !== 'object') return merged;
    Object.keys(overrides).forEach((key) => {
      if (key === 'mirrorX') return;
      merged[key] = cloneValue(overrides[key]);
    });
    if (typeof overrides.mirrorX === 'number' && typeof baseObject.x === 'number') {
      merged.x = (Number(overrides.mirrorX) * 2) - Number(baseObject.x);
    }
    return merged;
  }

  function expandObjectDefinitions(objects) {
    const expanded = [];
    safeArray(objects).forEach((objectDef) => {
      if (!objectDef || typeof objectDef !== 'object') return;
      expanded.push(applyObjectOverrides(objectDef, null));
      safeArray(objectDef.duplicates).forEach((duplicateDef) => {
        expanded.push(applyObjectOverrides(objectDef, duplicateDef));
      });
    });
    return expanded;
  }

  function normalizeAssetRef(asset) {
    if (!asset) return null;
    if (typeof asset === 'string') return { png: asset };
    if (typeof asset === 'object') return asset;
    return null;
  }

  function resolveAssetUrl(asset, version, supportsWebP) {
    const node = normalizeAssetRef(asset);
    if (!node) return null;
    if (supportsWebP && node.webp) return node.webp + '?v=' + version;
    if (node.png) return node.png + '?v=' + version;
    if (node.webp) return node.webp + '?v=' + version;
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

  function normalizeFrontOverlay(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.enabled === false) return null;

    const framesPath = typeof node.framesPath === 'string' ? node.framesPath.trim() : '';
    const hasExplicitFilePattern = Object.prototype.hasOwnProperty.call(node, 'filePattern') && node.filePattern != null;
    if (hasExplicitFilePattern && typeof node.filePattern !== 'string') return null;
    const trimmedFilePattern = hasExplicitFilePattern ? node.filePattern.trim() : '';
    const filePattern = trimmedFilePattern ? trimmedFilePattern : 'Front_{index}.png';

    function parseOverlayWholeNumber(name, fallbackValue) {
      const hasExplicitValue = Object.prototype.hasOwnProperty.call(node, name) && node[name] != null;
      if (!hasExplicitValue) return fallbackValue;
      if (typeof node[name] === 'boolean') return null;
      const numericValue = Number(node[name]);
      if (!Number.isInteger(numericValue)) return null;
      return numericValue;
    }

    const startIndex = parseOverlayWholeNumber('startIndex', 1);
    const zeroPad = parseOverlayWholeNumber('zeroPad', 3);
    const frameCount = parseOverlayWholeNumber('frameCount', null);
    const fps = parseOverlayWholeNumber('fps', null);

    if (
      !framesPath ||
      filePattern.indexOf('{index}') === -1 ||
      startIndex == null ||
      startIndex < 1 ||
      zeroPad == null ||
      zeroPad < 1 ||
      frameCount == null ||
      frameCount < 1 ||
      fps == null ||
      fps < 1
    ) {
      return null;
    }

    return {
      enabled: true,
      framesPath: framesPath,
      filePattern: filePattern,
      startIndex: startIndex,
      zeroPad: zeroPad,
      frameCount: frameCount,
      fps: fps,
      loop: node.loop !== false,
      depth: Number.isFinite(Number(node.depth)) ? Number(node.depth) : 5000
    };
  }

  function assetMatchesScope(assetNode, scopeRoot) {
    if (!scopeRoot) return true;
    const node = normalizeAssetRef(assetNode);
    if (!node) return false;
    const scopeNeedle = '/' + String(scopeRoot).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') + '/';
    const png = typeof node.png === 'string' ? node.png.replace(/\\/g, '/') : '';
    const webp = typeof node.webp === 'string' ? node.webp.replace(/\\/g, '/') : '';
    return png.includes(scopeNeedle) || webp.includes(scopeNeedle);
  }

  function makeStateTextureKey(prefix, actorId, state) {
    return prefix + '_' + actorId + '_' + state;
  }

  function parseActorStates(rawStates, scale) {
    const states = {};
    if (!rawStates || typeof rawStates !== 'object') return states;
    Object.keys(rawStates).forEach((key) => {
      const asset = normalizeSpriteAsset(rawStates[key], scale);
      if (asset) states[key] = asset;
    });
    return states;
  }

  function resolveStateAsset(actorDef, desiredState) {
    if (!actorDef || !actorDef.states) return null;
    const states = actorDef.states;
    if (desiredState && states[desiredState]) return { state: desiredState, asset: states[desiredState] };
    if (desiredState === 'idle_a' && states.idle) return { state: 'idle', asset: states.idle };
    if (desiredState === 'idle_b' && states.idle_b) return { state: 'idle_b', asset: states.idle_b };
    if (desiredState === 'idle_b' && states.idle) return { state: 'idle', asset: states.idle };
    if (desiredState && desiredState !== 'idle' && states.idle) return { state: 'idle', asset: states.idle };
    const firstState = Object.keys(states)[0];
    if (!firstState) return null;
    return { state: firstState, asset: states[firstState] };
  }

  function buildRuntimeTheme(themeConfig) {
    const cfg = themeConfig || {};
    const mainHeroNode = (cfg.mainHero && typeof cfg.mainHero === 'object') ? cfg.mainHero : {};
    const fallbackHero = (cfg.hero && typeof cfg.hero === 'object') ? cfg.hero : {};
    const mainScale = (typeof mainHeroNode.scale === 'number') ? mainHeroNode.scale : ((typeof fallbackHero.scale === 'number') ? fallbackHero.scale : 1.0);
    const mainHero = {
      id: String(mainHeroNode.id || mainHeroNode.role || fallbackHero.id || fallbackHero.role || 'songjiang'),
      label: String(mainHeroNode.label || '宋江'),
      role: String(mainHeroNode.role || fallbackHero.role || 'songjiang'),
      scale: mainScale,
      origin: normalizeOrigin(mainHeroNode.origin || fallbackHero.origin, { x: 0.5, y: 1.0 }),
      states: parseActorStates(mainHeroNode.states || {}, mainScale)
    };

    const supportHeroes = {};
    const rawSupport = (cfg.supportHeroes && typeof cfg.supportHeroes === 'object') ? cfg.supportHeroes : {};
    Object.keys(rawSupport).forEach((heroId) => {
      const node = rawSupport[heroId];
      if (!node || typeof node !== 'object') return;
      const scale = (typeof node.scale === 'number') ? node.scale : 1.0;
      supportHeroes[heroId] = {
        id: heroId,
        label: String(node.label || heroId),
        role: String(node.role || heroId),
        scale: scale,
        depth: (typeof node.depth === 'number') ? node.depth : 140,
        origin: normalizeOrigin(node.origin, { x: 0.5, y: 1.0 }),
        states: parseActorStates(node.states || {}, scale)
      };
    });

    const mainSceneNode = (cfg.mainScene && typeof cfg.mainScene === 'object') ? cfg.mainScene : {};
    const randomEventsNode = (mainSceneNode.randomEvents && typeof mainSceneNode.randomEvents === 'object')
      ? mainSceneNode.randomEvents
      : {};
    const supportRoamingNode = (mainSceneNode.supportRoaming && typeof mainSceneNode.supportRoaming === 'object')
      ? mainSceneNode.supportRoaming
      : {};
    const mainCast = {};
    const castNode = (mainSceneNode.cast && typeof mainSceneNode.cast === 'object') ? mainSceneNode.cast : {};
    Object.keys(castNode).forEach((heroId) => {
      const node = castNode[heroId];
      if (!node || typeof node !== 'object') return;
      if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
      mainCast[heroId] = {
        x: Number(node.x),
        y: Number(node.y),
        depth: (typeof node.depth === 'number') ? node.depth : 200,
        animationState: String(node.animationState || 'idle')
      };
    });

    const subscenes = {};
    const rawSubscenes = (cfg.subscenes && typeof cfg.subscenes === 'object') ? cfg.subscenes : {};
    Object.keys(rawSubscenes).forEach((state) => {
      const node = rawSubscenes[state];
      if (!node || typeof node !== 'object') return;
      if (!node.actorId || typeof node.x !== 'number' || typeof node.y !== 'number') return;
      subscenes[state] = {
        state: state,
        background: normalizeAssetRef(node.background),
        propsRoot: String(node.propsRoot || ''),
        frontOverlay: normalizeFrontOverlay(node.frontOverlay),
        actorId: String(node.actorId),
        animationState: String(node.animationState || state),
        x: Number(node.x),
        y: Number(node.y),
        depth: (typeof node.depth === 'number') ? node.depth : 220,
        handoffDurationMs: Math.max(0, Number(node.handoffDurationMs || 1400)),
        objects: safeArray(node.objects)
      };
    });

    return {
      assets: (cfg.assets && typeof cfg.assets === 'object') ? cfg.assets : {},
      mainHero: mainHero,
      supportHeroes: supportHeroes,
      mainScene: {
        background: normalizeAssetRef(mainSceneNode.background || ((cfg.assets && cfg.assets.bg) || null)),
        propsRoot: String(mainSceneNode.propsRoot || ''),
        handoff: (mainSceneNode.handoff && typeof mainSceneNode.handoff === 'object') ? mainSceneNode.handoff : {},
        frontOverlay: normalizeFrontOverlay(mainSceneNode.frontOverlay),
        supportRoaming: {
          enabled: supportRoamingNode.enabled !== false,
          startAfterInitialSeed: supportRoamingNode.startAfterInitialSeed !== false,
          pauseDuringBubble: supportRoamingNode.pauseDuringBubble !== false,
          startDelayMinMs: Math.max(0, Number((supportRoamingNode.startDelayMs && supportRoamingNode.startDelayMs[0]) || 600)),
          startDelayMaxMs: Math.max(0, Number((supportRoamingNode.startDelayMs && supportRoamingNode.startDelayMs[1]) || (supportRoamingNode.startDelayMs && supportRoamingNode.startDelayMs[0]) || 2600)),
          pauseMinMs: Math.max(0, Number((supportRoamingNode.pauseMs && supportRoamingNode.pauseMs[0]) || 900)),
          pauseMaxMs: Math.max(0, Number((supportRoamingNode.pauseMs && supportRoamingNode.pauseMs[1]) || (supportRoamingNode.pauseMs && supportRoamingNode.pauseMs[0]) || 2600)),
          speedMinPxPerSec: Math.max(1, Number((supportRoamingNode.speedPxPerSec && supportRoamingNode.speedPxPerSec[0]) || 22)),
          speedMaxPxPerSec: Math.max(1, Number((supportRoamingNode.speedPxPerSec && supportRoamingNode.speedPxPerSec[1]) || (supportRoamingNode.speedPxPerSec && supportRoamingNode.speedPxPerSec[0]) || 42)),
          reachThresholdPx: Math.max(1, Number(supportRoamingNode.reachThresholdPx || 8)),
          edgePaddingPx: Math.max(0, Number(supportRoamingNode.edgePaddingPx || 84)),
          innerPaddingPx: Math.max(0, Number(supportRoamingNode.innerPaddingPx || 34)),
          minLaneWidthPx: Math.max(40, Number(supportRoamingNode.minLaneWidthPx || 110)),
          yUpPx: Math.max(0, Number(supportRoamingNode.yUpPx || 14)),
          yDownPx: Math.max(0, Number(supportRoamingNode.yDownPx || 18)),
          minTargetSeparationPx: Math.max(24, Number(supportRoamingNode.minTargetSeparationPx || 105))
        },
        randomEvents: randomEventsNode,
        cast: mainCast
      },
      subscenes: subscenes,
      mainObjects: safeArray(cfg.objects),
      effects: (cfg.effects && typeof cfg.effects === 'object') ? cfg.effects : {}
    };
  }

  window.StarOfficeThemeRuntime = {
    safeArray: safeArray,
    clamp: clamp,
    randFloat: randFloat,
    normalizeOrigin: normalizeOrigin,
    cloneValue: cloneValue,
    applyObjectOverrides: applyObjectOverrides,
    expandObjectDefinitions: expandObjectDefinitions,
    normalizeAssetRef: normalizeAssetRef,
    resolveAssetUrl: resolveAssetUrl,
    normalizeSpriteAsset: normalizeSpriteAsset,
    normalizeFrontOverlay: normalizeFrontOverlay,
    assetMatchesScope: assetMatchesScope,
    makeStateTextureKey: makeStateTextureKey,
    parseActorStates: parseActorStates,
    resolveStateAsset: resolveStateAsset,
    buildRuntimeTheme: buildRuntimeTheme
  };
})();
