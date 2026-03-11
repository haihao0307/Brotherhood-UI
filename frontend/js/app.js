(function () {
  'use strict';

  const VERSION = (window.SO_VERSION && String(window.SO_VERSION)) ? String(window.SO_VERSION) : '0';
  const THEME_NAME = 'liangshan';

  const STATE_LABELS = {
    idle: '待命',
    writing: '写作',
    researching: '研究',
    executing: '执行',
    syncing: '同步',
    error: '出错'
  };

  const DEFAULT_DETAILS = {
    idle: '待命中',
    writing: '在写作中',
    researching: '在研究中',
    executing: '在执行中',
    syncing: '同步中',
    error: '出错了，排查中'
  };
  const AUDIO_STATES = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'];

  const ui = {
    coordsBtn: document.getElementById('coordsBtn'),
    audioBtn: document.getElementById('audioBtn'),
    coordsText: document.getElementById('coordsText'),
    statusText: document.getElementById('status-text'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingTitle: document.getElementById('loading-title'),
    loadingProgressBar: document.getElementById('loading-progress-bar'),
    errorPanel: document.getElementById('error-panel')
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  async function checkWebPSupport() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width === 1);
      img.onerror = () => resolve(false);
      img.src = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
    });
  }

  async function fetchThemeConfig(name) {
    const url = `/static/themes/${name}/theme.json?v=${VERSION}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`theme.json load failed: ${url} (${r.status})`);
    return await r.json();
  }

  function showLoadError(msg) {
    ui.errorPanel.style.display = 'block';
    ui.errorPanel.textContent = msg;
  }

  function hideLoadingOverlay() {
    ui.loadingOverlay.style.display = 'none';
  }

  function setLoadingProgress(p01) {
    const p = clamp(Math.floor(p01 * 100), 0, 100);
    ui.loadingProgressBar.style.width = p + '%';
  }

  function normalizeState(s) {
    if (!s) return 'idle';
    if (s === 'working') return 'writing';
    if (s === 'run' || s === 'running') return 'executing';
    if (s === 'sync') return 'syncing';
    if (s === 'research') return 'researching';
    return s;
  }

  function buildVersionedUrl(raw, version) {
    const mark = raw.includes('?') ? '&' : '?';
    return raw + mark + 'v=' + encodeURIComponent(version);
  }

  function createStateAudioManager(themeConfig, version) {
    const audioCfg = themeConfig && themeConfig.audio;
    const disabledStub = {
      hasAny: false,
      setEnabled: function () {},
      playForState: function () {},
      ensureForState: function () {},
      unlock: function () {},
      stop: function () {},
      setRole: function () {},
      getRole: function () { return null; }
    };

    if (!audioCfg || audioCfg.enabled === false) return disabledStub;

    const masterVolume = clamp(Number(audioCfg.volume || 0.55), 0, 1);
    const globalStates = (audioCfg.states && typeof audioCfg.states === 'object') ? audioCfg.states : {};
    const rolesCfg = (audioCfg.roles && typeof audioCfg.roles === 'object') ? audioCfg.roles : {};
    const mainHeroNode = (themeConfig && themeConfig.mainHero && typeof themeConfig.mainHero === 'object')
      ? themeConfig.mainHero
      : (themeConfig && themeConfig.hero && typeof themeConfig.hero === 'object' ? themeConfig.hero : null);
    const fallbackRole = (mainHeroNode && (mainHeroNode.role || mainHeroNode.id))
      ? String(mainHeroNode.role || mainHeroNode.id)
      : 'songjiang';
    let activeRole = String(audioCfg.role || fallbackRole || 'songjiang').trim();
    if (!activeRole) activeRole = 'songjiang';

    const cacheByRole = {};
    let enabled = true;
    let currentState = null;
    let currentRole = activeRole;
    let currentAudio = null;
    let pendingState = null;

    function getRoleNode(role) {
      const node = rolesCfg[role];
      return (node && typeof node === 'object') ? node : {};
    }

    function buildFromStateNode(node, pattern, role, state) {
      if (!node && !pattern) return null;
      const rawFile = (typeof node === 'string') ? node : (node && (node.mp3 || node.url));
      const file = rawFile || (pattern ? pattern.replace('{role}', role).replace('{state}', state) : null);
      if (!file) return null;

      const loop = !(node && node.loop === false);
      const stateVolume = (node && typeof node.volume === 'number') ? node.volume : 1.0;
      const volume = clamp(masterVolume * stateVolume, 0, 1);
      const audio = new Audio(buildVersionedUrl(String(file), version));
      audio.preload = 'auto';
      audio.loop = loop;
      audio.volume = volume;
      return { audio, loop, volume };
    }

    function ensureRoleEntries(role) {
      if (cacheByRole[role]) return cacheByRole[role];

      const roleNode = getRoleNode(role);
      const rolePattern = (roleNode && typeof roleNode.pattern === 'string') ? roleNode.pattern : null;
      const globalPattern = (typeof audioCfg.pattern === 'string') ? audioCfg.pattern : null;
      const pattern = rolePattern || globalPattern;
      const roleStates = (roleNode && roleNode.states && typeof roleNode.states === 'object') ? roleNode.states : {};
      const entries = {};

      for (const state of AUDIO_STATES) {
        const node = (state in roleStates) ? roleStates[state] : globalStates[state];
        const entry = buildFromStateNode(node, pattern, role, state);
        if (!entry) continue;
        entries[state] = entry;
      }
      cacheByRole[role] = entries;
      return entries;
    }

    function stopCurrent() {
      if (!currentAudio) return;
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
      currentState = null;
      currentRole = activeRole;
    }

    function playState(state, restart) {
      if (!enabled) return;
      const entries = ensureRoleEntries(activeRole);
      const entry = entries[state];
      if (!entry) return;
      if (!restart && currentState === state && currentRole === activeRole && currentAudio && !currentAudio.paused) return;

      if (currentAudio && currentAudio !== entry.audio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      currentAudio = entry.audio;
      currentState = state;
      currentRole = activeRole;
      currentAudio.loop = entry.loop;
      currentAudio.volume = entry.volume;
      if (restart) currentAudio.currentTime = 0;

      const playPromise = currentAudio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          pendingState = state;
        });
      }
    }

    return {
      hasAny: Object.keys(ensureRoleEntries(activeRole)).length > 0,
      setEnabled: function (next) {
        enabled = !!next;
        if (!enabled) {
          if (currentAudio) currentAudio.pause();
          return;
        }
        if (pendingState) {
          const s = pendingState;
          pendingState = null;
          playState(s, true);
        } else if (currentState) {
          playState(currentState, false);
        }
      },
      playForState: function (state) { playState(state, true); },
      ensureForState: function (state) { playState(state, false); },
      stop: function () { stopCurrent(); },
      setRole: function (role) {
        const next = String(role || '').trim();
        if (!next || next === activeRole) return;
        activeRole = next;
        stopCurrent();
      },
      getRole: function () { return activeRole; },
      unlock: function () {
        if (!enabled || !pendingState) return;
        const s = pendingState;
        pendingState = null;
        playState(s, true);
      }
    };
  }

  function formatLine(state, detail) {
    const label = STATE_LABELS[state] || state;
    const d = (detail && String(detail).trim()) ? String(detail).trim() : (DEFAULT_DETAILS[state] || '');
    return `[${label}] ${d}`;
  }

  function initCoordsToggle(state) {
    ui.coordsBtn.addEventListener('click', () => {
      state.coordsOn = !state.coordsOn;
      ui.coordsBtn.textContent = '坐标: ' + (state.coordsOn ? 'ON' : 'OFF');
    });
  }

  function initAudioToggle(state) {
    if (!ui.audioBtn) return;

    function redraw() {
      const available = !state.audioManager || !!state.audioManager.hasAny;
      if (!available) {
        ui.audioBtn.textContent = '音效: N/A';
        ui.audioBtn.disabled = true;
        return;
      }
      ui.audioBtn.disabled = false;
      ui.audioBtn.textContent = '音效: ' + (state.audioEnabled ? 'ON' : 'OFF');
    }

    state.refreshAudioBtn = redraw;
    redraw();
    ui.audioBtn.addEventListener('click', () => {
      if (state.audioManager && !state.audioManager.hasAny) return;
      state.audioEnabled = !state.audioEnabled;
      localStorage.setItem('so_audio_enabled', state.audioEnabled ? '1' : '0');
      if (state.audioManager) {
        state.audioManager.setEnabled(state.audioEnabled);
        if (state.audioEnabled && !state.pendingAudioState) {
          state.audioManager.ensureForState(state.currentState || 'idle');
        }
      }
      redraw();
    });
  }

  function isHeroMoving(engine) {
    if (!engine) return false;
    if (engine.moving) return true;
    if (!engine.heroBase || !engine.target) return false;
    const dx = Number(engine.target.x || 0) - Number(engine.heroBase.x || 0);
    const dy = Number(engine.target.y || 0) - Number(engine.heroBase.y || 0);
    return Math.sqrt(dx * dx + dy * dy) > 2.0;
  }

  function tryPlayPendingStateAudio(appState) {
    if (!appState.audioManager || !appState.audioEnabled) return;
    if (!appState.pendingAudioState) return;
    if (isHeroMoving(appState.engine)) return;
    syncAudioRole(appState, false);
    appState.audioManager.playForState(appState.pendingAudioState);
    appState.pendingAudioState = null;
  }

  function getDialogueConfig(themeConfig, state) {
    const dialogues = themeConfig && themeConfig.dialogues;
    if (!dialogues || typeof dialogues !== 'object') return null;
    const node = dialogues[state];
    if (!node || typeof node !== 'object') return null;
    const lines = [];
    if (Array.isArray(node.lines)) {
      for (const line of node.lines) {
        const text = String(line || '').trim();
        if (text) lines.push(text);
      }
    }
    if (!lines.length) {
      const text = (node.text && String(node.text).trim()) ? String(node.text).trim() : '';
      if (text) lines.push(text);
    }
    if (!lines.length) return null;
    const delayMs = Math.max(0, Number(node.delayMs || 0));
    return {
      speaker: String(node.speaker || 'songjiang'),
      lines: lines,
      delayMs: delayMs
    };
  }

  function getMainDialogueLoopConfig(themeConfig, state) {
    const dialogues = themeConfig && themeConfig.dialogues;
    if (!dialogues || typeof dialogues !== 'object') return null;
    const node = dialogues[state];
    if (!node || typeof node !== 'object') return null;
    const hasLoopConfig = [
      node.loopFirstDelayMinMs,
      node.loopFirstDelayMaxMs,
      node.loopIntervalMinMs,
      node.loopIntervalMaxMs
    ].some((value) => value != null);
    if (!hasLoopConfig) return null;
    const base = getDialogueConfig(themeConfig, state);
    if (!base) return null;
    return {
      lines: base.lines,
      firstDelayMinMs: Math.max(0, Number(node.loopFirstDelayMinMs || 2500)),
      firstDelayMaxMs: Math.max(0, Number(node.loopFirstDelayMaxMs || node.loopFirstDelayMinMs || 4000)),
      intervalMinMs: Math.max(0, Number(node.loopIntervalMinMs || 6000)),
      intervalMaxMs: Math.max(0, Number(node.loopIntervalMaxMs || node.loopIntervalMinMs || 12000)),
      minGapAfterSupportMs: Math.max(0, Number(node.loopMinGapAfterSupportMs || 2500))
    };
  }

  function randBetween(min, max) {
    const a = Math.max(0, Number(min || 0));
    const b = Math.max(a, Number(max || a));
    if (a === b) return a;
    return Math.floor(a + Math.random() * (b - a));
  }

  function getSupportDialogueConfig(themeConfig, heroId) {
    const root = themeConfig && themeConfig.supportDialogues;
    if (!root || typeof root !== 'object' || !heroId) return null;
    const defaults = (root.default && typeof root.default === 'object') ? root.default : {};
    const heroNode = (root[heroId] && typeof root[heroId] === 'object') ? root[heroId] : null;
    if (!heroNode || !Array.isArray(heroNode.lines) || heroNode.lines.length === 0) return null;
    const lines = heroNode.lines
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    if (!lines.length) return null;
    return {
      firstDelayMinMs: Math.max(0, Number(defaults.firstDelayMinMs || 2500)),
      firstDelayMaxMs: Math.max(0, Number(defaults.firstDelayMaxMs || 4000)),
      intervalMinMs: Math.max(0, Number(defaults.intervalMinMs || 6000)),
      intervalMaxMs: Math.max(0, Number(defaults.intervalMaxMs || 12000)),
      minGapAfterMainMs: Math.max(0, Number(defaults.minGapAfterMainMs || 2500)),
      lines: lines
    };
  }

  function pickSupportDialogueLine(appState, heroId, lines) {
    const lastLine = appState.lastSupportLineByHero[heroId] || null;
    if (lines.length === 1) {
      appState.lastSupportLineByHero[heroId] = lines[0];
      return lines[0];
    }
    const pool = lines.filter((line) => line !== lastLine);
    const next = pool[Math.floor(Math.random() * pool.length)];
    appState.lastSupportLineByHero[heroId] = next;
    return next;
  }

  function pickMainDialogueLine(appState, state, lines) {
    const lastLine = appState.lastMainLineByState[state] || null;
    if (lines.length === 1) {
      appState.lastMainLineByState[state] = lines[0];
      return lines[0];
    }
    const pool = lines.filter((line) => line !== lastLine);
    const next = pool[Math.floor(Math.random() * pool.length)];
    appState.lastMainLineByState[state] = next;
    return next;
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

  function clearPendingTransition(appState) {
    if (!appState.pendingTransition) return;
    clearTimeout(appState.pendingTransition.timerId);
    appState.pendingTransition = null;
  }

  function clearSupportDialogueLoop(appState) {
    if (appState.supportDialogueTimerId) {
      clearTimeout(appState.supportDialogueTimerId);
      appState.supportDialogueTimerId = null;
    }
    appState.supportDialogueHeroId = null;
  }

  function clearMainDialogueLoop(appState) {
    if (appState.mainDialogueTimerId) {
      clearTimeout(appState.mainDialogueTimerId);
      appState.mainDialogueTimerId = null;
    }
    appState.mainDialogueState = null;
  }

  function scheduleNextSupportDialogue(appState, heroId, cfg, options) {
    const opts = options || {};
    clearSupportDialogueLoop(appState);

    const baseDelay = opts.first
      ? randBetween(cfg.firstDelayMinMs, cfg.firstDelayMaxMs)
      : randBetween(cfg.intervalMinMs, cfg.intervalMaxMs);

    const now = Date.now();
    const waitForMainGap = Math.max(0, (appState.lastMainDialogueAt + cfg.minGapAfterMainMs) - now);
    const delayMs = Math.max(baseDelay, waitForMainGap);

    appState.supportDialogueHeroId = heroId;
    appState.supportDialogueTimerId = setTimeout(() => {
      const activeHeroId = appState.engine && typeof appState.engine.getActiveSupportHeroId === 'function'
        ? appState.engine.getActiveSupportHeroId()
        : null;
      const visible = appState.engine && typeof appState.engine.hasVisibleSupportHero === 'function'
        ? appState.engine.hasVisibleSupportHero()
        : false;

      if (activeHeroId !== heroId) {
        clearSupportDialogueLoop(appState);
        return;
      }

      if (!visible) {
        scheduleNextSupportDialogue(appState, heroId, cfg, { first: true });
        return;
      }

      const line = pickSupportDialogueLine(appState, heroId, cfg.lines);
      showBubble(appState, line, {
        speaker: 'support',
        durationMs: Math.max(2600, Math.min(5200, line.length * 180))
      });
      appState.lastSupportDialogueAt = Date.now();
      scheduleNextSupportDialogue(appState, heroId, cfg, { first: false });
    }, delayMs);
  }

  function restartSupportDialogueLoop(appState) {
    clearSupportDialogueLoop(appState);
    if (!appState.engine || typeof appState.engine.getActiveSupportHeroId !== 'function') return;
    const heroId = appState.engine.getActiveSupportHeroId();
    const cfg = getSupportDialogueConfig(appState.themeConfig, heroId);
    if (!cfg) return;
    scheduleNextSupportDialogue(appState, heroId, cfg, { first: true });
  }

  function scheduleNextMainDialogue(appState, state, cfg, options) {
    const opts = options || {};
    clearMainDialogueLoop(appState);

    const baseDelay = opts.first
      ? randBetween(cfg.firstDelayMinMs, cfg.firstDelayMaxMs)
      : randBetween(cfg.intervalMinMs, cfg.intervalMaxMs);

    const now = Date.now();
    const waitForSupportGap = Math.max(0, (appState.lastSupportDialogueAt + cfg.minGapAfterSupportMs) - now);
    const delayMs = Math.max(baseDelay, waitForSupportGap);

    appState.mainDialogueState = state;
    appState.mainDialogueTimerId = setTimeout(() => {
      const currentState = appState.currentState;
      const supportVisible = appState.engine && typeof appState.engine.hasVisibleSupportHero === 'function'
        ? appState.engine.hasVisibleSupportHero()
        : false;

      if (currentState !== state || supportVisible) {
        clearMainDialogueLoop(appState);
        return;
      }

      if (isHeroMoving(appState.engine)) {
        scheduleNextMainDialogue(appState, state, cfg, { first: true });
        return;
      }

      const line = pickMainDialogueLine(appState, state, cfg.lines);
      showBubble(appState, line, {
        speaker: 'main',
        durationMs: Math.max(2600, Math.min(5200, line.length * 180))
      });
      appState.lastMainDialogueAt = Date.now();
      scheduleNextMainDialogue(appState, state, cfg, { first: false });
    }, delayMs);
  }

  function restartMainDialogueLoop(appState) {
    clearMainDialogueLoop(appState);
    if (!appState.currentState) return;
    const supportVisible = appState.engine && typeof appState.engine.hasVisibleSupportHero === 'function'
      ? appState.engine.hasVisibleSupportHero()
      : false;
    if (supportVisible) return;
    const cfg = getMainDialogueLoopConfig(appState.themeConfig, appState.currentState);
    if (!cfg) return;
    scheduleNextMainDialogue(appState, appState.currentState, cfg, { first: true });
  }

  function applyVisualState(appState, next, detail, options) {
    const opts = options || {};
    appState.currentState = next;
    appState.currentDetail = detail;
    if (appState.engine) appState.engine.setTargetForState(next);
    appState.pendingAudioState = next;
    if (appState.audioManager) appState.audioManager.stop();
    syncAudioRole(appState, false);
    if (opts.showBubble === false) {
      setStatusLine(appState, next, detail, { showBubble: false });
    } else {
      setStatusLine(appState, next, detail);
    }
    tryPlayPendingStateAudio(appState);
    restartSupportDialogueLoop(appState);
    restartMainDialogueLoop(appState);
  }

  function scheduleStateTransition(appState, next, detail) {
    clearPendingTransition(appState);
    clearSupportDialogueLoop(appState);
    clearMainDialogueLoop(appState);

    const dialogue = getDialogueConfig(appState.themeConfig, next);
    const isInitialNonIdleState = appState.currentState === null && next !== 'idle';
    const needsDelay = !!dialogue && (
      (appState.currentState !== null && appState.currentState !== next) ||
      isInitialNonIdleState
    );

    setStatusLine(appState, next, detail, { showBubble: !needsDelay });

    if (!needsDelay) {
      applyVisualState(appState, next, detail, { showBubble: false });
      return;
    }

    const mainLine = pickMainDialogueLine(appState, next, dialogue.lines);
    appState.lastMainDialogueAt = Date.now();
    showBubble(appState, mainLine, { durationMs: Math.max(2200, dialogue.delayMs + 1200) });
    const timerId = setTimeout(() => {
      if (!appState.pendingTransition || appState.pendingTransition.timerId !== timerId) return;
      appState.pendingTransition = null;
      applyVisualState(appState, next, detail, { showBubble: false });
    }, dialogue.delayMs);

    appState.pendingTransition = {
      state: next,
      detail: detail,
      timerId: timerId
    };
  }

  async function init() {
    const appState = {
      supportsWebP: false,
      themeName: THEME_NAME,
      themeConfig: null,
      coordsOn: false,
      audioEnabled: localStorage.getItem('so_audio_enabled') !== '0',
      audioManager: null,
      pendingAudioState: null,
      refreshAudioBtn: null,
      lastPointer: { x: null, y: null },
      lastClickCopiedAt: 0,
      requestedState: null,
      requestedDetail: '',
      currentState: null,
      currentDetail: '',
      lastLine: '',
      engine: null,
      sceneRef: null,
      bubble: null // { container, hideAt }
      ,
      activeAudioRole: null,
      pendingTransition: null,
      supportDialogueTimerId: null,
      supportDialogueHeroId: null,
      mainDialogueTimerId: null,
      mainDialogueState: null,
      lastMainDialogueAt: 0,
      lastSupportDialogueAt: 0,
      lastMainLineByState: {},
      lastSupportLineByHero: {}
    };

    document.addEventListener('pointerdown', () => {
      if (appState.audioManager) appState.audioManager.unlock();
    }, { passive: true });

    initCoordsToggle(appState);
    initAudioToggle(appState);

    appState.supportsWebP = await checkWebPSupport();
    ui.loadingTitle.textContent = '加载 Brotherhood-UI 主题中...';

    try {
      appState.themeConfig = await fetchThemeConfig(appState.themeName);
    } catch (e) {
      showLoadError(
        'Brotherhood-UI 主题加载失败。\n\n' +
        '错误: ' + (e && e.message ? e.message : String(e))
      );
      return;
    }

    const config = {
      type: Phaser.AUTO,
      parent: 'game-container',
      width: 1280,
      height: 720,
      backgroundColor: '#000000',
      pixelArt: true,
      physics: { default: 'arcade' },
      scene: {
        preload: function () { preloadScene(this, appState); },
        create: function () { createScene(this, appState); },
        update: function (time, delta) { updateScene(this, appState, time, delta); }
      }
    };

    new Phaser.Game(config);

    // Panels
    if (window.StarOfficePanels && typeof window.StarOfficePanels.initControlPanel === 'function') {
      window.StarOfficePanels.initControlPanel({
        fetchStatusNow: () => fetchStatusAndApply(appState)
      });
    }
    if (window.StarOfficePanels && typeof window.StarOfficePanels.initMemoPanel === 'function') {
      window.StarOfficePanels.initMemoPanel();
    }

    // Expose minimal API for debugging
    window.StarOfficeApp = {
      fetchStatusNow: () => fetchStatusAndApply(appState),
      setAudioRole: (role) => {
        if (!appState.audioManager) return;
        appState.activeAudioRole = String(role || '').trim() || appState.activeAudioRole;
        appState.audioManager.setRole(role);
        if (!appState.pendingAudioState) appState.audioManager.ensureForState(appState.currentState || 'idle');
      }
    };
  }

  function preloadScene(scene, appState) {
    setLoadingProgress(0.02);
    scene.load.on('progress', (p) => setLoadingProgress(p));
    scene.load.on('complete', () => {
      setLoadingProgress(1.0);
      hideLoadingOverlay();
    });

    const engine = new window.StarOfficeThemeEngine.ThemeEngine(appState.themeConfig, {
      version: VERSION,
      supportsWebP: appState.supportsWebP
    });
    appState.engine = engine;
    engine.preload(scene);
  }

  function createScene(scene, appState) {
    appState.sceneRef = scene;
    appState.engine.create(scene);
    appState.audioManager = createStateAudioManager(appState.themeConfig, VERSION);
    if (appState.audioManager && appState.audioManager.hasAny) {
      appState.audioManager.setEnabled(appState.audioEnabled);
    }
    if (typeof appState.refreshAudioBtn === 'function') appState.refreshAudioBtn();

    // Pointer coords + copy
    scene.input.on('pointermove', (p) => {
      appState.lastPointer = { x: Math.round(p.x), y: Math.round(p.y) };
      if (appState.coordsOn) ui.coordsText.textContent = `x: ${appState.lastPointer.x}, y: ${appState.lastPointer.y}`;
    });

    scene.input.on('pointerdown', async (p) => {
      if (appState.audioManager) appState.audioManager.unlock();
      if (!appState.coordsOn) return;
      const x = Math.round(p.x), y = Math.round(p.y);
      ui.coordsText.textContent = `x: ${x}, y: ${y}`;
      const text = `${x},${y}`;
      try {
        await navigator.clipboard.writeText(text);
        appState.lastClickCopiedAt = Date.now();
      } catch (e) {
        // ignore (clipboard may be blocked)
      }
      console.log('[coords]', text);
    });

    // Initial UI + polling
    setStatusLine(appState, 'idle', DEFAULT_DETAILS.idle);
    scene.time.addEvent({ delay: 1200, loop: true, callback: () => fetchStatusAndApply(appState) });
    fetchStatusAndApply(appState);
  }

  async function fetchStatusAndApply(appState) {
    try {
      const r = await fetch('/status', { cache: 'no-store' });
      const data = await r.json();
      const next = normalizeState(data && data.state);
      const detail = data && data.detail;
      const role = data && (data.role || data.character || data.agentRole);
      if (role && appState.audioManager && (!appState.engine || typeof appState.engine.getPreferredAudioRole !== 'function')) {
        appState.audioManager.setRole(role);
      }

      const detailText = (detail && String(detail).trim()) ? String(detail).trim() : (DEFAULT_DETAILS[next] || '');
      const stateChanged = next !== appState.requestedState;
      const detailChanged = detailText !== appState.requestedDetail;
      const requestChanged = stateChanged || detailChanged;
      appState.requestedState = next;
      appState.requestedDetail = detailText;

      if (stateChanged) {
        scheduleStateTransition(appState, next, detailText);
      } else if (requestChanged && !appState.pendingTransition) {
        if (appState.currentState === next) {
          appState.currentDetail = detailText;
          setStatusLine(appState, next, detailText, { showBubble: false });
        }
      } else if (!appState.pendingTransition) {
        syncAudioRole(appState, !appState.pendingAudioState);
        if (!appState.pendingAudioState && appState.audioManager) appState.audioManager.ensureForState(next);
        tryPlayPendingStateAudio(appState);
        const line = formatLine(next, detailText);
        if (line !== appState.lastLine) setStatusLine(appState, next, detailText, { showBubble: false });
      }
    } catch (e) {
      ui.statusText.textContent = '[离线] 无法拉取状态，检查 backend 是否启动 (http://127.0.0.1:18791)';
    }
  }

  function setStatusLine(appState, state, detail, options) {
    const opts = options || {};
    const line = formatLine(state, detail);
    appState.lastLine = line;
    ui.statusText.textContent = line;
    if (opts.showBubble !== false) showBubble(appState, line);
  }

  function showBubble(appState, text, options) {
    const scene = appState.sceneRef;
    const opts = options || {};
    const speaker = opts.speaker === 'support' ? 'support' : 'main';
    const hero = appState.engine && typeof appState.engine.getActorForSpeaker === 'function'
      ? appState.engine.getActorForSpeaker(speaker)
      : (appState.engine && appState.engine.hero);
    if (!scene || !hero) return;
    if (appState.bubble && appState.bubble.container) appState.bubble.container.destroy();

    const fontSize = 12;
    const padX = 8, padY = 6;
    const maxW = 360;

    const txt = scene.add.text(0, 0, text, {
      fontFamily: 'ArkPixel, monospace',
      fontSize: fontSize + 'px',
      color: '#111',
      wordWrap: { width: maxW }
    }).setOrigin(0.5, 0.5);

    const w = clamp(txt.width + padX * 2, 60, maxW + padX * 2);
    const h = clamp(txt.height + padY * 2, 26, 120);

    const g = scene.add.graphics();
    g.fillStyle(0xfff7d6, 0.98);
    g.lineStyle(3, 0x1b1b1b, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    g.fillTriangle(-10, h / 2 - 2, 10, h / 2 - 2, 0, h / 2 + 12);
    g.strokeTriangle(-10, h / 2 - 2, 10, h / 2 - 2, 0, h / 2 + 12);

    const c = scene.add.container(0, 0, [g, txt]);
    c.setDepth(9999);

    const durationMs = Math.max(600, Number(opts.durationMs || 6500));
    appState.bubble = { container: c, hideAt: scene.time.now + durationMs, speaker: speaker };
    updateBubblePos(appState);
  }

  function updateBubblePos(appState) {
    const scene = appState.sceneRef;
    const bubble = appState.bubble;
    const hero = appState.engine && bubble && typeof appState.engine.getActorForSpeaker === 'function'
      ? appState.engine.getActorForSpeaker(bubble.speaker || 'main')
      : (appState.engine && appState.engine.hero);
    if (!scene || !hero || !bubble || !bubble.container) return;
    const topY = hero.y - hero.displayHeight;
    bubble.container.x = hero.x;
    bubble.container.y = topY - 18;
  }

  function updateScene(scene, appState, time, delta) {
    // coords display when OFF
    if (!appState.coordsOn) {
      const now = Date.now();
      if (now - appState.lastClickCopiedAt < 900) {
        ui.coordsText.textContent = '已复制坐标';
      } else if (appState.lastPointer.x != null) {
        ui.coordsText.textContent = `x: ${appState.lastPointer.x}, y: ${appState.lastPointer.y}`;
      } else {
        ui.coordsText.textContent = 'x: -, y: -';
      }
    }

    // bubble follow + auto-hide
    if (appState.bubble && appState.bubble.hideAt && scene.time.now > appState.bubble.hideAt) {
      if (appState.bubble.container) appState.bubble.container.destroy();
      appState.bubble = null;
    }
    updateBubblePos(appState);

    // game objects update
    if (appState.engine) appState.engine.update(time, delta, appState.currentState);
    syncAudioRole(appState, !appState.pendingAudioState);
    tryPlayPendingStateAudio(appState);
    updateBubblePos(appState);
  }

  init();
})();
