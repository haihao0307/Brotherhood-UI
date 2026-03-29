(function () {
  'use strict';

  const VERSION = (window.SO_VERSION && String(window.SO_VERSION)) ? String(window.SO_VERSION) : '0';
  const THEME_NAME = 'liangshan';
  const i18n = window.BrotherhoodI18n || null;

  const STATE_LABELS = {
    idle: '',
    writing: '',
    researching: '',
    executing: '',
    syncing: '',
    error: ''
  };

  const DEFAULT_DETAILS = {
    idle: '',
    writing: '',
    researching: '',
    executing: '',
    syncing: '',
    error: ''
  };
  const HERO_NAMES = {
    songjiang: '宋江',
    wuyong: '吳用',
    sunerniang: '孫二娘',
    wusong: '武松',
    linchong: '林沖',
    luzhishen: '魯智深',
    idle: '宋江',
    writing: '吳用',
    researching: '孫二娘',
    executing: '武松',
    syncing: '林沖',
    error: '魯智深'
  };
  const STATE_KEYS = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'];
  const bootstrapRuntime = window.BrotherhoodBootstrapRuntime || {};
  const appUiRuntime = window.BrotherhoodAppUi || {};
  const ui = typeof appUiRuntime.createUiRefs === 'function'
    ? appUiRuntime.createUiRefs(document)
    : {
      coordsBtn: document.getElementById('coordsBtn'),
      audioBtn: document.getElementById('audioBtn'),
      coordsText: document.getElementById('coordsText'),
      statusText: document.getElementById('statusLine'),
      statusHeadline: document.getElementById('statusHeadline'),
      statusStage: document.getElementById('statusStage'),
      statusFocus: document.getElementById('statusFocus'),
      statusHistory: document.getElementById('statusHistory'),
      statusMeta: document.getElementById('statusMeta'),
      controlPanelSummary: document.getElementById('controlPanelSummary'),
      memoPanelSummary: document.getElementById('memoPanelSummary'),
      toolsToggle: document.getElementById('toolsToggle'),
      toolsToggleLabel: document.getElementById('toolsToggleLabel'),
      toolsLayer: document.getElementById('toolsLayer'),
      toolsDrawer: document.getElementById('toolsDrawer'),
      toolsBackdrop: document.getElementById('toolsBackdrop'),
      toolsCloseBtn: document.getElementById('toolsCloseBtn'),
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingTitle: document.getElementById('loading-title'),
      loadingProgressBar: document.getElementById('loading-progress-bar'),
      errorPanel: document.getElementById('error-panel')
    };
  const audioRuntime = window.BrotherhoodAudioRuntime || {};
  const dialogueRuntime = window.BrotherhoodDialogueRuntime || {};
  const narrativeRuntime = window.BrotherhoodNarrativeStatusRuntime || {};
  const stateFlowRuntime = window.BrotherhoodStateFlow || {};
  const statusRuntime = window.BrotherhoodStatusRuntime || {};
  const sceneRuntime = window.BrotherhoodSceneRuntime || {};
  const checkWebPSupport = typeof bootstrapRuntime.checkWebPSupport === 'function'
    ? bootstrapRuntime.checkWebPSupport
    : async function () { return false; };
  const fetchThemeConfig = typeof bootstrapRuntime.fetchThemeConfig === 'function'
    ? function (name) { return bootstrapRuntime.fetchThemeConfig(name, VERSION); }
    : async function () { throw new Error('theme loader unavailable'); };
  const normalizeState = typeof bootstrapRuntime.normalizeState === 'function'
    ? bootstrapRuntime.normalizeState
    : function (s) { return s || 'idle'; };
  const createStateAudioManager = function (themeConfig, version) {
    if (typeof bootstrapRuntime.createStateAudioManager === 'function') {
      return bootstrapRuntime.createStateAudioManager(themeConfig, version, audioRuntime);
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
  };
  const isHeroMoving = typeof bootstrapRuntime.isHeroMoving === 'function'
    ? bootstrapRuntime.isHeroMoving
    : function () { return false; };
  const tryPlayPendingStateAudio = typeof bootstrapRuntime.tryPlayPendingStateAudio === 'function'
    ? bootstrapRuntime.tryPlayPendingStateAudio
    : function () {};

  function getHandoffDialogueConfig(themeConfig, state) {
    if (typeof dialogueRuntime.getHandoffDialogueConfig === 'function') {
      return dialogueRuntime.getHandoffDialogueConfig(themeConfig, state);
    }
    return null;
  }

  function getHeroDialogueNode(themeConfig, heroId, state) {
    if (typeof dialogueRuntime.getHeroDialogueNode === 'function') {
      return dialogueRuntime.getHeroDialogueNode(themeConfig, heroId, state);
    }
    return null;
  }

  function getHeroDialogueLoopConfig(themeConfig, heroId, state) {
    if (typeof dialogueRuntime.getHeroDialogueLoopConfig === 'function') {
      return dialogueRuntime.getHeroDialogueLoopConfig(themeConfig, heroId, state);
    }
    return null;
  }

  function randBetween(min, max) {
    if (typeof dialogueRuntime.randBetween === 'function') {
      return dialogueRuntime.randBetween(min, max);
    }
    const a = Math.max(0, Number(min || 0));
    const b = Math.max(a, Number(max || a));
    if (a === b) return a;
    return Math.floor(a + Math.random() * (b - a));
  }

  function getIdleRandomEventConfig(themeConfig) {
    if (typeof dialogueRuntime.getIdleRandomEventConfig === 'function') {
      return dialogueRuntime.getIdleRandomEventConfig(themeConfig);
    }
    return null;
  }

  function pickDialogueEntry(appState, key, entries) {
    if (typeof dialogueRuntime.pickDialogueEntry === 'function') {
      return dialogueRuntime.pickDialogueEntry(appState, key, entries);
    }
    return entries[0];
  }

  function getAdaptiveBubbleDurationMs(text, options) {
    if (typeof dialogueRuntime.getAdaptiveBubbleDurationMs === 'function') {
      return dialogueRuntime.getAdaptiveBubbleDurationMs(text, options);
    }
    return Math.max(2600, Math.min(5200, String(text || '').length * 180));
  }

  const clearStateGateTimer = typeof bootstrapRuntime.clearStateGateTimer === 'function'
    ? bootstrapRuntime.clearStateGateTimer
    : function () {};

  function getTransitionBlockedUntil(appState, nextState) {
    if (typeof stateFlowRuntime.getTransitionBlockedUntil === 'function') {
      return stateFlowRuntime.getTransitionBlockedUntil(appState, nextState);
    }
    return Date.now();
  }

  function getStateFlowConfig(themeConfig) {
    if (typeof stateFlowRuntime.getStateFlowConfig === 'function') {
      return stateFlowRuntime.getStateFlowConfig(themeConfig);
    }
    return {
      minIdleMs: 900,
      minChildSceneMs: 2600,
      minHandoffMs: 0
    };
  }

  const syncAudioRole = typeof bootstrapRuntime.syncAudioRole === 'function'
    ? bootstrapRuntime.syncAudioRole
    : function () {};

  const clearPendingTransition = typeof bootstrapRuntime.clearPendingTransition === 'function'
    ? bootstrapRuntime.clearPendingTransition
    : function () {};

  function getEffectiveWorkflowState(appState) {
    if (typeof stateFlowRuntime.getEffectiveWorkflowState === 'function') {
      return stateFlowRuntime.getEffectiveWorkflowState(appState);
    }
    return (appState && appState.currentState) ? appState.currentState : 'idle';
  }

  function resolveScenePhase(appState) {
    if (typeof stateFlowRuntime.resolveScenePhase === 'function') {
      return stateFlowRuntime.resolveScenePhase(appState);
    }
    if (!appState || !appState.currentState) return 'boot';
    return appState.currentState === 'idle' ? 'main_idle' : 'child_active';
  }

  function resolveDialogueMode(appState) {
    if (typeof stateFlowRuntime.resolveDialogueMode === 'function') {
      return stateFlowRuntime.resolveDialogueMode(appState);
    }
    return 'none';
  }

  const dialogueSchedulerRuntime = window.BrotherhoodDialogueScheduler || {};

  function getDialogueSchedulerDeps() {
    return {
      getEffectiveWorkflowState,
      resolveScenePhase,
      resolveDialogueMode,
      getIdleRandomEventConfig,
      getHeroDialogueLoopConfig,
      pickDialogueEntry,
      randBetween,
      getAdaptiveBubbleDurationMs,
      showBubble: uiApi.showBubble,
      clearCurrentBubble: uiApi.clearCurrentBubble,
      isHeroMoving
    };
  }

  function isSupportWorkerActive(appState) {
    if (typeof dialogueSchedulerRuntime.isSupportWorkerActive === 'function') {
      return dialogueSchedulerRuntime.isSupportWorkerActive(appState);
    }
    return false;
  }

  function shouldUseMainDialogueLoop(appState) {
    if (typeof dialogueSchedulerRuntime.shouldUseMainDialogueLoop === 'function') {
      return dialogueSchedulerRuntime.shouldUseMainDialogueLoop(appState);
    }
    return true;
  }

  function clearSupportDialogueLoop(appState) {
    if (typeof dialogueSchedulerRuntime.clearSupportDialogueLoop === 'function') {
      return dialogueSchedulerRuntime.clearSupportDialogueLoop(appState);
    }
  }

  function clearMainDialogueLoop(appState) {
    if (typeof dialogueSchedulerRuntime.clearMainDialogueLoop === 'function') {
      return dialogueSchedulerRuntime.clearMainDialogueLoop(appState);
    }
  }

  function clearIdleRandomEventLoop(appState) {
    if (typeof dialogueSchedulerRuntime.clearIdleRandomEventLoop === 'function') {
      return dialogueSchedulerRuntime.clearIdleRandomEventLoop(appState);
    }
  }

  function clearIdleRandomEventState(appState) {
    if (typeof dialogueSchedulerRuntime.clearIdleRandomEventState === 'function') {
      return dialogueSchedulerRuntime.clearIdleRandomEventState(appState, getDialogueSchedulerDeps());
    }
    uiApi.clearCurrentBubble(appState);
  }

  function syncSupportRoaming(appState) {
    if (typeof dialogueSchedulerRuntime.syncSupportRoaming === 'function') {
      return dialogueSchedulerRuntime.syncSupportRoaming(appState);
    }
  }

  function isIdleRandomEventEligible(appState) {
    if (typeof dialogueSchedulerRuntime.isIdleRandomEventEligible === 'function') {
      return dialogueSchedulerRuntime.isIdleRandomEventEligible(appState);
    }
    return false;
  }

  function clearDialogueSchedulers(appState) {
    if (typeof dialogueSchedulerRuntime.clearDialogueSchedulers === 'function') {
      return dialogueSchedulerRuntime.clearDialogueSchedulers(appState, getDialogueSchedulerDeps());
    }
  }

  function restartDialogueSchedulers(appState) {
    if (typeof dialogueSchedulerRuntime.restartDialogueSchedulers === 'function') {
      return dialogueSchedulerRuntime.restartDialogueSchedulers(appState, getDialogueSchedulerDeps());
    }
  }

  function syncStateMachine(appState, options) {
    if (typeof dialogueSchedulerRuntime.syncStateMachine === 'function') {
      return dialogueSchedulerRuntime.syncStateMachine(appState, getDialogueSchedulerDeps(), options);
    }
  }

  function restartIdleRandomEventLoop(appState) {
    if (typeof dialogueSchedulerRuntime.restartIdleRandomEventLoop === 'function') {
      return dialogueSchedulerRuntime.restartIdleRandomEventLoop(appState, getDialogueSchedulerDeps());
    }
  }

  function restartSupportDialogueLoop(appState) {
    if (typeof dialogueSchedulerRuntime.restartSupportDialogueLoop === 'function') {
      return dialogueSchedulerRuntime.restartSupportDialogueLoop(appState, getDialogueSchedulerDeps());
    }
  }

  function restartMainDialogueLoop(appState) {
    if (typeof dialogueSchedulerRuntime.restartMainDialogueLoop === 'function') {
      return dialogueSchedulerRuntime.restartMainDialogueLoop(appState, getDialogueSchedulerDeps());
    }
  }

  const uiApi = {
    showLoadError: typeof appUiRuntime.showLoadError === 'function' ? appUiRuntime.showLoadError : function (uiNode, msg) {
      uiNode.errorPanel.style.display = 'block';
      uiNode.errorPanel.textContent = msg;
    },
    hideLoadingOverlay: typeof appUiRuntime.hideLoadingOverlay === 'function' ? appUiRuntime.hideLoadingOverlay : function (uiNode) {
      uiNode.loadingOverlay.style.display = 'none';
    },
    setLoadingProgress: typeof appUiRuntime.setLoadingProgress === 'function' ? appUiRuntime.setLoadingProgress : function (uiNode, p01) {
      uiNode.loadingProgressBar.style.width = Math.max(0, Math.min(100, Math.floor(p01 * 100))) + '%';
    },
    formatLine: typeof appUiRuntime.formatLine === 'function' ? appUiRuntime.formatLine : function (state, detail, labels, details) {
      const label = labels[state] || state;
      const d = (detail && String(detail).trim()) ? String(detail).trim() : (details[state] || '');
      return `[${label}] ${d}`;
    },
    initCoordsToggle: typeof appUiRuntime.initCoordsToggle === 'function' ? appUiRuntime.initCoordsToggle : function () {},
    initAudioToggle: typeof appUiRuntime.initAudioToggle === 'function' ? appUiRuntime.initAudioToggle : function () {},
    initToolsDrawer: typeof appUiRuntime.initToolsDrawer === 'function' ? appUiRuntime.initToolsDrawer : function () {},
    clearCurrentBubble: typeof appUiRuntime.clearCurrentBubble === 'function' ? appUiRuntime.clearCurrentBubble : function (appState) {
      if (appState.bubble && appState.bubble.container) appState.bubble.container.destroy();
      appState.bubble = null;
    },
    showBubble: typeof appUiRuntime.showBubble === 'function' ? appUiRuntime.showBubble : function () {},
    updateBubblePos: typeof appUiRuntime.updateBubblePos === 'function' ? appUiRuntime.updateBubblePos : function () {},
    setStatusLine: typeof appUiRuntime.setStatusLine === 'function' ? appUiRuntime.setStatusLine : function () {}
  };
  const statusApi = typeof statusRuntime.createStatusRuntime === 'function'
    ? statusRuntime.createStatusRuntime({
      normalizeState,
      getTransitionBlockedUntil,
      getStateFlowConfig,
      getHandoffDialogueConfig,
      pickDialogueEntry,
      clearDialogueSchedulers,
      syncStateMachine,
      syncAudioRole,
      tryPlayPendingStateAudio,
      setStatusLine: uiApi.setStatusLine,
      showBubble: uiApi.showBubble,
      clearStateGateTimer,
      clearPendingTransition,
      formatLine: uiApi.formatLine,
      stateLabels: STATE_LABELS,
      defaultDetails: DEFAULT_DETAILS,
      ui
    })
    : null;
  const sceneApi = typeof sceneRuntime.createSceneRuntime === 'function'
    ? sceneRuntime.createSceneRuntime({
      version: VERSION,
      ui,
      uiApi,
      createStateAudioManager,
      statusApi,
      defaultDetails: DEFAULT_DETAILS,
      stateLabels: STATE_LABELS,
      syncAudioRole,
      tryPlayPendingStateAudio,
      isIdleRandomEventEligible,
      restartIdleRandomEventLoop
    })
    : null;
  const narrativeApi = typeof narrativeRuntime.createNarrativeStatusRuntime === 'function'
    ? narrativeRuntime.createNarrativeStatusRuntime({
      ui,
      stateLabels: STATE_LABELS,
      defaultDetails: DEFAULT_DETAILS,
      heroNames: HERO_NAMES,
      i18n: i18n
    })
    : null;

  function tr(key, params, fallback) {
    if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
    return fallback != null ? fallback : key;
  }

  function refreshLocaleModels() {
    STATE_KEYS.forEach((stateKey) => {
      STATE_LABELS[stateKey] = tr('state.labels.' + stateKey, null, stateKey);
      DEFAULT_DETAILS[stateKey] = tr('state.defaults.' + stateKey, null, stateKey);
      HERO_NAMES[stateKey] = tr('hero.' + (stateKey === 'idle' ? 'songjiang' : stateKey === 'writing' ? 'wuyong' : stateKey === 'researching' ? 'sunerniang' : stateKey === 'executing' ? 'wusong' : stateKey === 'syncing' ? 'linchong' : 'luzhishen'));
    });
    HERO_NAMES.songjiang = tr('hero.songjiang');
    HERO_NAMES.wuyong = tr('hero.wuyong');
    HERO_NAMES.sunerniang = tr('hero.sunerniang');
    HERO_NAMES.wusong = tr('hero.wusong');
    HERO_NAMES.linchong = tr('hero.linchong');
    HERO_NAMES.luzhishen = tr('hero.luzhishen');
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
      workflowState: 'idle',
      scenePhase: 'boot',
      dialogueMode: 'none',
      currentDetail: '',
      lastLine: '',
      engine: null,
      sceneRef: null,
      bubble: null // { container, hideAt }
      ,
      activeAudioRole: null,
      pendingTransition: null,
      pendingTransitionTimerId: null,
      stateGateTimerId: null,
      toolsOpen: false,
      supportDialogueTimerId: null,
      supportDialogueHeroId: null,
      mainDialogueTimerId: null,
      mainDialogueState: null,
      lastMainDialogueAt: 0,
      lastSupportDialogueAt: 0,
      scenePhaseChangedAt: 0,
      childSceneEnteredAt: 0,
      idleSceneEnteredAt: 0,
      lastDialogueLineByKey: {},
      lastDialogueTagsByKey: {},
      idleRandomEventTimerId: null,
      activeIdleEventHeroId: null,
      lastIdleEventAtByHero: {},
      lastIdleEventId: null,
      initialIdleRandomSeedPending: true,
      supportRoamingUnlocked: false,
      supportRoamingUnlockTimerId: null
    };

    document.addEventListener('pointerdown', () => {
      if (appState.audioManager) appState.audioManager.unlock();
    }, { passive: true });

    if (i18n && typeof i18n.init === 'function') i18n.init(document);
    refreshLocaleModels();
    uiApi.initCoordsToggle(ui, appState);
    uiApi.initAudioToggle(ui, appState);
    if (typeof uiApi.initToolsDrawer === 'function') uiApi.initToolsDrawer(ui, appState);
    if (narrativeApi && typeof narrativeApi.start === 'function') {
      narrativeApi.start(appState);
    }
    if (i18n && typeof i18n.subscribe === 'function') {
      i18n.subscribe(() => {
        refreshLocaleModels();
        if (ui.loadingOverlay && ui.loadingOverlay.style.display !== 'none') {
          ui.loadingTitle.textContent = tr('loading.title');
        }
        if (narrativeApi && typeof narrativeApi.render === 'function') narrativeApi.render(appState);
        if (typeof appState.refreshAudioBtn === 'function') appState.refreshAudioBtn();
      });
    }

    appState.supportsWebP = await checkWebPSupport();
    ui.loadingTitle.textContent = tr('loading.title');

    try {
      appState.themeConfig = await fetchThemeConfig(appState.themeName);
    } catch (e) {
      uiApi.showLoadError(ui,
        tr('loading.failed') + '\n\n' +
        tr('loading.errorPrefix') + (e && e.message ? e.message : String(e))
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
        preload: function () { sceneApi.preloadScene(this, appState); },
        create: function () { sceneApi.createScene(this, appState); },
        update: function (time, delta) { sceneApi.updateScene(this, appState, time, delta); }
      }
    };

    new Phaser.Game(config);

    // Panels
    if (window.StarOfficePanels && typeof window.StarOfficePanels.initControlPanel === 'function') {
      window.StarOfficePanels.initControlPanel({
        fetchStatusNow: async () => {
          await statusApi.fetchStatusAndApply(appState);
          if (narrativeApi && typeof narrativeApi.refresh === 'function') {
            await narrativeApi.refresh(appState);
          }
        }
      });
    }
    if (window.StarOfficePanels && typeof window.StarOfficePanels.initMemoPanel === 'function') {
      window.StarOfficePanels.initMemoPanel();
    }

    // Expose minimal API for debugging
    window.StarOfficeApp = {
      fetchStatusNow: async () => {
        await statusApi.fetchStatusAndApply(appState);
        if (narrativeApi && typeof narrativeApi.refresh === 'function') {
          await narrativeApi.refresh(appState);
        }
      },
      setAudioRole: (role) => {
        if (!appState.audioManager) return;
        appState.activeAudioRole = String(role || '').trim() || appState.activeAudioRole;
        appState.audioManager.setRole(role);
        if (!appState.pendingAudioState) appState.audioManager.ensureForState(appState.currentState || 'idle');
      },
      getDebugState: () => ({
        currentState: appState.currentState,
        workflowState: appState.workflowState,
        scenePhase: appState.scenePhase,
        dialogueMode: appState.dialogueMode,
        currentDetail: appState.currentDetail,
        requestedState: appState.requestedState,
        requestedDetail: appState.requestedDetail,
        pendingTransition: appState.pendingTransition ? {
          state: appState.pendingTransition.state || null,
          detail: appState.pendingTransition.detail || '',
          readyAt: Number(appState.pendingTransition.readyAt || 0),
          remainingMs: Math.max(0, Number(appState.pendingTransition.readyAt || 0) - Date.now()),
          token: appState.pendingTransition.token || null,
          timerArmed: !!appState.pendingTransitionTimerId
        } : null,
        stateGateTimerArmed: !!appState.stateGateTimerId,
        scenePhaseChangedAt: Number(appState.scenePhaseChangedAt || 0),
        childSceneEnteredAt: Number(appState.childSceneEnteredAt || 0),
        idleSceneEnteredAt: Number(appState.idleSceneEnteredAt || 0),
        bubbleVisible: !!(appState.bubble && appState.bubble.container),
        bubbleHeroId: appState.bubble ? (appState.bubble.heroId || null) : null,
        bubbleSpeaker: appState.bubble ? (appState.bubble.speaker || null) : null,
        bubbleDebug: appState.bubble ? {
          heroId: appState.bubble.heroId || null,
          speaker: appState.bubble.speaker || null,
          textStyle: appState.bubble.textStyle ? { ...appState.bubble.textStyle } : null
        } : null,
        activeIdleEventHeroId: appState.activeIdleEventHeroId || null,
        idleRandomEventTimerArmed: !!appState.idleRandomEventTimerId,
        idleRandomEventPoolSize: (() => {
          const cfg = getIdleRandomEventConfig(appState.themeConfig);
          return cfg && Array.isArray(cfg.pool) ? cfg.pool.length : 0;
        })(),
        initialIdleRandomSeedPending: !!appState.initialIdleRandomSeedPending,
        supportRoamingUnlocked: !!appState.supportRoamingUnlocked,
        mainDialogueTimerArmed: !!appState.mainDialogueTimerId,
        supportDialogueTimerArmed: !!appState.supportDialogueTimerId,
        sceneMode: appState.engine ? appState.engine.sceneMode : null,
        currentWorkerHeroId: (appState.engine && typeof appState.engine.getCurrentWorkerHeroId === 'function')
          ? appState.engine.getCurrentWorkerHeroId()
          : null,
        supportCastDebug: (() => {
          if (!appState.engine || !appState.engine.supportCast) return {};
          const out = {};
          Object.keys(appState.engine.supportCast).forEach((heroId) => {
            const actor = appState.engine.supportCast[heroId];
            if (!actor) return;
            out[heroId] = {
              x: Number(actor.x.toFixed(2)),
              y: Number(actor.y.toFixed(2)),
              visible: !!actor.visible,
              animKey: actor.anims && actor.anims.currentAnim ? actor.anims.currentAnim.key : null
            };
          });
          return out;
        })(),
        sceneObjectDebug: (appState.engine && typeof appState.engine.getDebugSceneState === 'function')
          ? appState.engine.getDebugSceneState()
          : null
      })
    };
  }

  init();
})();
