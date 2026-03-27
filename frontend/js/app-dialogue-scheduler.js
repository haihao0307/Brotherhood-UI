(function () {
  'use strict';

  function isSupportWorkerActive(appState) {
    if (!appState.engine) return false;
    if (typeof appState.engine.isChildSceneActive === 'function' && !appState.engine.isChildSceneActive()) return false;
    if (typeof appState.engine.getActiveSupportHeroId !== 'function') return false;
    return !!appState.engine.getActiveSupportHeroId();
  }

  function shouldUseMainDialogueLoop(appState) {
    if (!appState.engine) return true;
    const childActive = typeof appState.engine.isChildSceneActive === 'function'
      ? appState.engine.isChildSceneActive()
      : false;
    if (!childActive) return true;
    const workerHeroId = typeof appState.engine.getCurrentWorkerHeroId === 'function'
      ? appState.engine.getCurrentWorkerHeroId()
      : null;
    const mainHeroId = typeof appState.engine.getMainHeroId === 'function'
      ? appState.engine.getMainHeroId()
      : null;
    return !!workerHeroId && !!mainHeroId && workerHeroId === mainHeroId;
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

  function clearIdleRandomEventLoop(appState) {
    if (appState.idleRandomEventTimerId) {
      clearTimeout(appState.idleRandomEventTimerId);
      appState.idleRandomEventTimerId = null;
    }
  }

  function clearIdleRandomEventState(appState, deps) {
    clearIdleRandomEventLoop(appState);
    if (appState.activeIdleEventHeroId && appState.engine && typeof appState.engine.clearIdleEventEmphasis === 'function') {
      appState.engine.clearIdleEventEmphasis(appState.activeIdleEventHeroId);
    } else if (appState.engine && typeof appState.engine.clearAllIdleEventEmphasis === 'function') {
      appState.engine.clearAllIdleEventEmphasis();
    }
    appState.activeIdleEventHeroId = null;
    deps.clearCurrentBubble(appState);
  }

  function syncSupportRoaming(appState) {
    if (!appState.engine || typeof appState.engine.setSupportRoamingEnabled !== 'function') return;
    const enabled = (
      appState.scenePhase === 'main_idle' &&
      appState.dialogueMode === 'idle_event' &&
      !!appState.supportRoamingUnlocked
    );
    appState.engine.setSupportRoamingEnabled(enabled, appState.sceneRef && appState.sceneRef.time ? appState.sceneRef.time.now : 0);
  }

  function isIdleRandomEventEligible(appState) {
    if (!appState || appState.dialogueMode !== 'idle_event') return false;
    if (!appState.engine) return false;
    if (appState.bubble && appState.bubble.container) return false;
    return true;
  }

  function clearDialogueSchedulers(appState, deps) {
    clearSupportDialogueLoop(appState);
    clearMainDialogueLoop(appState);
    clearIdleRandomEventState(appState, deps);
  }

  function restartDialogueSchedulers(appState, deps) {
    clearSupportDialogueLoop(appState);
    clearMainDialogueLoop(appState);
    clearIdleRandomEventLoop(appState);

    if (appState.dialogueMode === 'idle_event') {
      restartIdleRandomEventLoop(appState, deps);
      return;
    }

    if (appState.dialogueMode !== 'worker_loop') return;

    if (isSupportWorkerActive(appState)) {
      restartSupportDialogueLoop(appState, deps);
      return;
    }

    restartMainDialogueLoop(appState, deps);
  }

  function syncStateMachine(appState, deps, options) {
    const opts = options || {};
    const prevScenePhase = appState.scenePhase;
    appState.workflowState = deps.getEffectiveWorkflowState(appState);
    appState.scenePhase = deps.resolveScenePhase(appState);
    appState.dialogueMode = deps.resolveDialogueMode(appState);
    if (prevScenePhase !== appState.scenePhase) {
      appState.scenePhaseChangedAt = Date.now();
      if (appState.scenePhase === 'child_active' && appState.workflowState !== 'idle') {
        appState.childSceneEnteredAt = appState.scenePhaseChangedAt;
      }
      if (appState.scenePhase === 'main_idle') {
        appState.idleSceneEnteredAt = appState.scenePhaseChangedAt;
      }
    }
    syncSupportRoaming(appState);
    if (opts.restartDialogue !== false) {
      restartDialogueSchedulers(appState, deps);
    }
  }

  function pickWeightedIdleEvent(appState, cfg) {
    const now = Date.now();
    const pool = cfg.pool || [];
    const eligible = pool.filter((item) => {
      const lastAt = Number(appState.lastIdleEventAtByHero[item.heroId] || 0);
      return (now - lastAt) >= cfg.cooldownPerHeroMs;
    });
    const candidates = eligible.length ? eligible : pool;
    if (!candidates.length) return null;
    const filtered = candidates.length > 1 && appState.lastIdleEventId
      ? candidates.filter((item) => item.id !== appState.lastIdleEventId)
      : candidates;
    const source = filtered.length ? filtered : candidates;
    const total = source.reduce((sum, item) => sum + Math.max(1, Number(item.weight || 1)), 0);
    let roll = Math.random() * total;
    for (const item of source) {
      roll -= Math.max(1, Number(item.weight || 1));
      if (roll <= 0) return item;
    }
    return source[source.length - 1];
  }

  function triggerIdleRandomEvent(appState, cfg, event, deps) {
    if (!event) return;
    const computedDurationMs = deps.getAdaptiveBubbleDurationMs(event.text);
    const durationMs = Math.max(
      1800,
      Number(event.durationMs || 0),
      Number(cfg.bubbleDurationMs || 0),
      computedDurationMs
    );
    const highlightMs = Math.max(1200, Number(cfg.highlightDurationMs || durationMs));
    appState.activeIdleEventHeroId = event.heroId;
    appState.lastIdleEventId = event.id;
    appState.lastIdleEventAtByHero[event.heroId] = Date.now();
    if (appState.engine && typeof appState.engine.applyIdleEventEmphasis === 'function') {
      appState.engine.applyIdleEventEmphasis(event.heroId, {
        tint: event.tint,
        scaleBoost: event.scaleBoost,
        durationMs: highlightMs
      });
    }
    deps.showBubble(appState, event.text, {
      heroId: event.heroId,
      durationMs: durationMs
    });
    appState.lastMainDialogueAt = Date.now();
    const clearHeroId = event.heroId;
    setTimeout(() => {
      if (appState.activeIdleEventHeroId !== clearHeroId) return;
      if (appState.engine && typeof appState.engine.clearIdleEventEmphasis === 'function') {
        appState.engine.clearIdleEventEmphasis(clearHeroId);
      }
      appState.activeIdleEventHeroId = null;
    }, highlightMs);
    return durationMs;
  }

  function scheduleNextIdleRandomEvent(appState, cfg, deps, options) {
    const opts = options || {};
    clearIdleRandomEventLoop(appState);
    if (!isIdleRandomEventEligible(appState)) return;
    const delayMs = (typeof opts.delayMs === 'number')
      ? Math.max(0, Number(opts.delayMs))
      : deps.randBetween(cfg.intervalMinMs, cfg.intervalMaxMs);
    appState.idleRandomEventTimerId = setTimeout(() => {
      appState.idleRandomEventTimerId = null;
      if (!isIdleRandomEventEligible(appState)) return;
      let event = null;
      if (opts.heroId) {
        const forcedPool = (cfg.pool || []).filter((item) => item.heroId === opts.heroId);
        event = forcedPool.length ? pickWeightedIdleEvent({
          ...appState,
          lastIdleEventId: null
        }, { ...cfg, pool: forcedPool, cooldownPerHeroMs: 0 }) : null;
      }
      if (!event) event = pickWeightedIdleEvent(appState, cfg);
      if (!event) {
        scheduleNextIdleRandomEvent(appState, cfg, deps);
        return;
      }
      const durationMs = triggerIdleRandomEvent(appState, cfg, event, deps);
      if (opts.consumeInitialSeed) {
        appState.initialIdleRandomSeedPending = false;
        if (appState.supportRoamingUnlockTimerId) {
          clearTimeout(appState.supportRoamingUnlockTimerId);
          appState.supportRoamingUnlockTimerId = null;
        }
        appState.supportRoamingUnlockTimerId = setTimeout(() => {
          appState.supportRoamingUnlockTimerId = null;
          appState.supportRoamingUnlocked = true;
          syncSupportRoaming(appState);
        }, Math.max(1200, Number(durationMs || 0)));
      }
      scheduleNextIdleRandomEvent(appState, cfg, deps);
    }, delayMs);
  }

  function restartIdleRandomEventLoop(appState, deps) {
    clearIdleRandomEventLoop(appState);
    const cfg = deps.getIdleRandomEventConfig(appState.themeConfig);
    if (!cfg) return;
    if (!isIdleRandomEventEligible(appState)) return;
    if (appState.initialIdleRandomSeedPending) {
      scheduleNextIdleRandomEvent(appState, cfg, deps, {
        delayMs: 2000,
        heroId: 'songjiang',
        consumeInitialSeed: true
      });
      return;
    }
    scheduleNextIdleRandomEvent(appState, cfg, deps);
  }

  function scheduleNextSupportDialogue(appState, heroId, cfg, deps, options) {
    const opts = options || {};
    clearSupportDialogueLoop(appState);

    const baseDelay = opts.first
      ? deps.randBetween(cfg.firstDelayMinMs, cfg.firstDelayMaxMs)
      : deps.randBetween(cfg.intervalMinMs, cfg.intervalMaxMs);

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
        scheduleNextSupportDialogue(appState, heroId, cfg, deps, { first: true });
        return;
      }

      const line = deps.pickDialogueEntry(appState, heroId + ':' + appState.currentState, cfg.entries).text;
      const durationMs = deps.getAdaptiveBubbleDurationMs(line);
      deps.showBubble(appState, line, {
        speaker: 'support',
        durationMs: durationMs
      });
      appState.lastSupportDialogueAt = Date.now();
      scheduleNextSupportDialogue(appState, heroId, cfg, deps, { first: false });
    }, delayMs);
  }

  function restartSupportDialogueLoop(appState, deps) {
    clearSupportDialogueLoop(appState);
    if (appState.dialogueMode !== 'worker_loop') return;
    if (!isSupportWorkerActive(appState)) return;
    const heroId = appState.engine.getActiveSupportHeroId();
    const cfg = deps.getHeroDialogueLoopConfig(appState.themeConfig, heroId, appState.currentState);
    if (!cfg) return;
    scheduleNextSupportDialogue(appState, heroId, cfg, deps, { first: true });
  }

  function scheduleNextMainDialogue(appState, state, cfg, deps, options) {
    const opts = options || {};
    clearMainDialogueLoop(appState);

    const baseDelay = opts.first
      ? deps.randBetween(cfg.firstDelayMinMs, cfg.firstDelayMaxMs)
      : deps.randBetween(cfg.intervalMinMs, cfg.intervalMaxMs);

    const now = Date.now();
    const waitForSupportGap = Math.max(0, (appState.lastSupportDialogueAt + cfg.minGapAfterSupportMs) - now);
    const delayMs = Math.max(baseDelay, waitForSupportGap);

    appState.mainDialogueState = state;
    appState.mainDialogueTimerId = setTimeout(() => {
      const currentState = appState.currentState;
      if (currentState !== state || !shouldUseMainDialogueLoop(appState)) {
        clearMainDialogueLoop(appState);
        return;
      }

      if (deps.isHeroMoving(appState.engine)) {
        scheduleNextMainDialogue(appState, state, cfg, deps, { first: true });
        return;
      }

      const line = deps.pickDialogueEntry(appState, cfg.dialogueKey || state, cfg.entries).text;
      const durationMs = deps.getAdaptiveBubbleDurationMs(line);
      deps.showBubble(appState, line, {
        speaker: 'main',
        durationMs: durationMs
      });
      appState.lastMainDialogueAt = Date.now();
      scheduleNextMainDialogue(appState, state, cfg, deps, { first: false });
    }, delayMs);
  }

  function restartMainDialogueLoop(appState, deps) {
    clearMainDialogueLoop(appState);
    if (appState.dialogueMode !== 'worker_loop') return;
    if (!appState.currentState) return;
    if (!shouldUseMainDialogueLoop(appState)) return;
    const heroId = appState.engine && typeof appState.engine.getCurrentWorkerHeroId === 'function'
      ? appState.engine.getCurrentWorkerHeroId()
      : ((appState.themeConfig && appState.themeConfig.mainHero && appState.themeConfig.mainHero.id) || 'songjiang');
    const cfg = deps.getHeroDialogueLoopConfig(appState.themeConfig, heroId, appState.currentState);
    if (!cfg) return;
    cfg.dialogueKey = heroId + ':' + appState.currentState;
    scheduleNextMainDialogue(appState, appState.currentState, cfg, deps, { first: true });
  }

  window.BrotherhoodDialogueScheduler = {
    isSupportWorkerActive,
    shouldUseMainDialogueLoop,
    clearSupportDialogueLoop,
    clearMainDialogueLoop,
    clearIdleRandomEventLoop,
    clearIdleRandomEventState,
    syncSupportRoaming,
    isIdleRandomEventEligible,
    clearDialogueSchedulers,
    restartDialogueSchedulers,
    syncStateMachine,
    pickWeightedIdleEvent,
    triggerIdleRandomEvent,
    scheduleNextIdleRandomEvent,
    restartIdleRandomEventLoop,
    scheduleNextSupportDialogue,
    restartSupportDialogueLoop,
    scheduleNextMainDialogue,
    restartMainDialogueLoop
  };
})();
