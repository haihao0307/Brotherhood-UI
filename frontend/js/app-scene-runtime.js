(function () {
  'use strict';

  function createSceneRuntime(deps) {
    const {
      version,
      ui,
      uiApi,
      createStateAudioManager,
      statusApi,
      defaultDetails,
      stateLabels,
      syncAudioRole,
      tryPlayPendingStateAudio,
      isIdleRandomEventEligible,
      restartIdleRandomEventLoop
    } = deps;

    function t(key, params, fallback) {
      const i18n = window.BrotherhoodI18n;
      if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
      return fallback != null ? fallback : key;
    }

    function preloadScene(scene, appState) {
      uiApi.setLoadingProgress(ui, 0.02);
      scene.load.on('progress', (p) => uiApi.setLoadingProgress(ui, p));
      scene.load.on('complete', () => {
        uiApi.setLoadingProgress(ui, 1.0);
        uiApi.hideLoadingOverlay(ui);
      });

      const engine = new window.StarOfficeThemeEngine.ThemeEngine(appState.themeConfig, {
        version: version,
        supportsWebP: appState.supportsWebP
      });
      appState.engine = engine;
      engine.preload(scene);
    }

    function createScene(scene, appState) {
      appState.sceneRef = scene;
      appState.engine.create(scene);
      appState.audioManager = createStateAudioManager(appState.themeConfig, version);
      if (appState.audioManager && appState.audioManager.hasAny) {
        appState.audioManager.setEnabled(appState.audioEnabled);
      }
      if (typeof appState.refreshAudioBtn === 'function') appState.refreshAudioBtn();

      scene.input.on('pointermove', (p) => {
        appState.lastPointer = { x: Math.round(p.x), y: Math.round(p.y) };
        if (appState.coordsOn) ui.coordsText.textContent = `x: ${appState.lastPointer.x}, y: ${appState.lastPointer.y}`;
      });

      scene.input.on('pointerdown', async (p) => {
        if (appState.audioManager) appState.audioManager.unlock();
        if (!appState.coordsOn) return;
        const x = Math.round(p.x);
        const y = Math.round(p.y);
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

      uiApi.setStatusLine(appState, 'idle', defaultDetails.idle, undefined, stateLabels, defaultDetails, ui);
      scene.time.addEvent({ delay: 1200, loop: true, callback: () => statusApi.fetchStatusAndApply(appState) });
      statusApi.fetchStatusAndApply(appState);
    }

    function updateScene(scene, appState, time, delta) {
      if (!appState.coordsOn) {
        const now = Date.now();
        if (now - appState.lastClickCopiedAt < 900) {
          ui.coordsText.textContent = t('chrome.coords.copied', null, '已複製座標');
        } else if (appState.lastPointer.x != null) {
          ui.coordsText.textContent = `x: ${appState.lastPointer.x}, y: ${appState.lastPointer.y}`;
        } else {
          ui.coordsText.textContent = t('chrome.coords.unknown', null, 'x: -, y: -');
        }
      }

      if (appState.bubble && appState.bubble.hideAt && scene.time.now > appState.bubble.hideAt) {
        uiApi.clearCurrentBubble(appState);
      }
      uiApi.updateBubblePos(appState);

      if (appState.engine) appState.engine.update(time, delta, appState.currentState);
      syncAudioRole(appState, !appState.pendingAudioState);
      tryPlayPendingStateAudio(appState);
      if (!appState.idleRandomEventTimerId && !appState.activeIdleEventHeroId && appState.dialogueMode === 'idle_event' && isIdleRandomEventEligible(appState)) {
        restartIdleRandomEventLoop(appState);
      }
      uiApi.updateBubblePos(appState);
    }

    return {
      preloadScene,
      createScene,
      updateScene
    };
  }

  window.BrotherhoodSceneRuntime = {
    createSceneRuntime
  };
})();
