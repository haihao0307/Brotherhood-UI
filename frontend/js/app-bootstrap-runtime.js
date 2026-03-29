(function () {
  'use strict';

  function checkWebPSupport() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width === 1);
      img.onerror = () => resolve(false);
      img.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    });
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepMergeThemeConfig(base, patch) {
    const output = Array.isArray(base) ? base.slice() : Object.assign({}, base || {});
    Object.keys(patch || {}).forEach((key) => {
      const incoming = patch[key];
      const current = output[key];
      if (isPlainObject(current) && isPlainObject(incoming)) {
        output[key] = deepMergeThemeConfig(current, incoming);
        return;
      }
      if (Array.isArray(incoming)) {
        output[key] = incoming.slice();
        return;
      }
      output[key] = incoming;
    });
    return output;
  }

  function resolveThemeIncludeUrl(themeUrl, includeRef) {
    const ref = String(includeRef || '').trim();
    if (!ref) return '';
    if (/^https?:\/\//i.test(ref) || ref.startsWith('/')) return ref;
    try {
      return new URL(ref, window.location.origin + themeUrl).pathname;
    } catch (err) {
      return ref;
    }
  }

  async function fetchJsonNoStore(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`theme.json load failed: ${url} (${r.status})`);
    return await r.json();
  }

  async function fetchThemeConfig(name, version) {
    const themeUrl = `/static/themes/${name}/theme.json?v=${version}`;
    let themeConfig = await fetchJsonNoStore(themeUrl);
    const includes = (themeConfig && themeConfig.includes && typeof themeConfig.includes === 'object')
      ? themeConfig.includes
      : {};
    for (const includeRef of Object.values(includes)) {
      const includeUrl = resolveThemeIncludeUrl(themeUrl, includeRef);
      if (!includeUrl) continue;
      const includeConfig = await fetchJsonNoStore(includeUrl + (includeUrl.includes('?') ? '&' : '?') + `v=${version}`);
      themeConfig = deepMergeThemeConfig(themeConfig, includeConfig);
    }
    return themeConfig;
  }

  function normalizeState(s) {
    if (!s) return 'idle';
    if (s === 'working') return 'writing';
    if (s === 'run' || s === 'running') return 'executing';
    if (s === 'sync') return 'syncing';
    if (s === 'research') return 'researching';
    return s;
  }

  function createStateAudioManager(themeConfig, version, audioRuntime) {
    if (audioRuntime && typeof audioRuntime.createStateAudioManager === 'function') {
      return audioRuntime.createStateAudioManager(themeConfig, version);
    }
    return {
      hasAny: false,
      setEnabled: function () {},
      playForState: function () {},
      ensureForState: function () {},
      unlock: function () {},
      stop: function () {},
      setRole: function () {},
      getRole: function () { return null; }
    };
  }

  function isHeroMoving(engine) {
    if (!engine) return false;
    if (engine.moving) return true;
    if (!engine.heroBase || !engine.target) return false;
    const dx = Number(engine.target.x || 0) - Number(engine.heroBase.x || 0);
    const dy = Number(engine.target.y || 0) - Number(engine.heroBase.y || 0);
    return Math.sqrt(dx * dx + dy * dy) > 2.0;
  }

  function getDesiredAudioRole(appState) {
    if (appState.engine && typeof appState.engine.getPreferredAudioRole === 'function') {
      const role = appState.engine.getPreferredAudioRole(appState.currentState || 'idle');
      if (role) return role;
    }
    const mainHeroNode = (appState.themeConfig && appState.themeConfig.mainHero && typeof appState.themeConfig.mainHero === 'object')
      ? appState.themeConfig.mainHero
      : (appState.themeConfig && appState.themeConfig.hero && typeof appState.themeConfig.hero === 'object'
        ? appState.themeConfig.hero
        : null);
    if (mainHeroNode && (mainHeroNode.role || mainHeroNode.id)) {
      return String(mainHeroNode.role || mainHeroNode.id);
    }
    return 'songjiang';
  }

  function syncAudioRole(appState, restartIfChanged) {
    if (!appState.audioManager) return;
    const nextRole = getDesiredAudioRole(appState);
    if (!nextRole) return;
    if (appState.activeAudioRole === nextRole) return;
    appState.activeAudioRole = nextRole;
    appState.audioManager.setRole(nextRole);
    if (restartIfChanged && appState.currentState) {
      appState.audioManager.stop();
      appState.pendingAudioState = appState.currentState;
    }
  }

  function tryPlayPendingStateAudio(appState) {
    if (!appState.audioManager || !appState.audioEnabled) return;
    if (!appState.pendingAudioState) return;
    if (isHeroMoving(appState.engine)) return;
    syncAudioRole(appState, false);
    appState.audioManager.playForState(appState.pendingAudioState);
    appState.pendingAudioState = null;
  }

  function clearStateGateTimer(appState) {
    if (!appState.stateGateTimerId) return;
    clearTimeout(appState.stateGateTimerId);
    appState.stateGateTimerId = null;
  }

  function clearPendingTransition(appState) {
    if (!appState.pendingTransition) return;
    if (appState.pendingTransitionTimerId) {
      clearTimeout(appState.pendingTransitionTimerId);
      appState.pendingTransitionTimerId = null;
    }
    appState.pendingTransition = null;
  }

  window.BrotherhoodBootstrapRuntime = {
    checkWebPSupport,
    fetchThemeConfig,
    normalizeState,
    createStateAudioManager,
    isHeroMoving,
    tryPlayPendingStateAudio,
    clearStateGateTimer,
    clearPendingTransition,
    getDesiredAudioRole,
    syncAudioRole
  };
})();
