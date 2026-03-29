(function () {
  'use strict';

  function createStatusRuntime(deps) {
    const {
      normalizeState,
      getTransitionBlockedUntil,
      getStateFlowConfig,
      getHandoffDialogueConfig,
      pickDialogueEntry,
      clearDialogueSchedulers,
      syncStateMachine,
      syncAudioRole,
      tryPlayPendingStateAudio,
      setStatusLine,
      clearStateGateTimer,
      clearPendingTransition,
      stateLabels,
      defaultDetails,
      ui
    } = deps;

    function t(key, params, fallback) {
      const i18n = window.BrotherhoodI18n;
      if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
      return fallback != null ? fallback : key;
    }

    function applyVisualState(appState, next, detail, options) {
      const opts = options || {};
      appState.currentState = next;
      appState.currentDetail = detail;
      if (appState.engine) appState.engine.setTargetForState(next, { phase: opts.phase || (next === 'idle' ? 'main_idle' : 'child') });
      appState.pendingAudioState = next;
      if (appState.audioManager) appState.audioManager.stop();
      syncAudioRole(appState, false);
      if (opts.showBubble === false) {
        setStatusLine(appState, next, detail, { showBubble: false }, stateLabels, defaultDetails, ui);
      } else {
        setStatusLine(appState, next, detail, undefined, stateLabels, defaultDetails, ui);
      }
      tryPlayPendingStateAudio(appState);
      syncStateMachine(appState);
    }

    function scheduleStateTransition(appState, next, detail) {
      clearStateGateTimer(appState);
      clearPendingTransition(appState);
      clearDialogueSchedulers(appState);

      if (next === 'idle') {
        applyVisualState(appState, next, detail, { showBubble: false, phase: 'main_idle' });
        return;
      }

      const dialogue = getHandoffDialogueConfig(appState.themeConfig, next);
      const isInitialNonIdleState = appState.currentState === null && next !== 'idle';
      const shouldTransition = (
        (appState.currentState !== null && appState.currentState !== next) ||
        isInitialNonIdleState
      );
      const engineDelay = appState.engine && typeof appState.engine.getHandoffDurationForState === 'function'
        ? appState.engine.getHandoffDurationForState(next)
        : 0;
      const dialogueDelay = dialogue ? dialogue.delayMs : 0;
      const handoffDelay = Math.max(engineDelay, dialogueDelay, getStateFlowConfig(appState.themeConfig).minHandoffMs);
      const needsDelay = shouldTransition && handoffDelay > 0;

      appState.currentDetail = detail;
      setStatusLine(appState, next, detail, { showBubble: !needsDelay }, stateLabels, defaultDetails, ui);

      if (!needsDelay) {
        applyVisualState(appState, next, detail, { showBubble: false, phase: 'child' });
        return;
      }

      if (appState.engine) appState.engine.setTargetForState(next, { phase: 'handoff' });
      appState.pendingTransition = {
        state: next,
        detail: detail,
        readyAt: Date.now() + handoffDelay,
        token: 'transition_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
      };
      const transitionToken = appState.pendingTransition.token;
      appState.pendingTransitionTimerId = setTimeout(() => {
        if (!appState.pendingTransition || appState.pendingTransition.token !== transitionToken) return;
        appState.pendingTransitionTimerId = null;
        appState.pendingTransition = null;
        applyVisualState(appState, next, detail, { showBubble: false, phase: 'child' });
      }, handoffDelay);
      syncStateMachine(appState, { restartDialogue: false });
      if (dialogue) {
        try {
          const mainLine = pickDialogueEntry(appState, 'handoff:' + next, dialogue.entries).text;
          appState.lastMainDialogueAt = Date.now();
          deps.showBubble(appState, mainLine, { durationMs: Math.max(1500, handoffDelay + 180) });
        } catch (err) {
          console.warn('[Brotherhood-UI] handoff bubble skipped:', err && err.message ? err.message : err);
        }
      }
    }

    function reconcileRequestedState(appState) {
      clearStateGateTimer(appState);
      const next = appState.requestedState || 'idle';
      const detail = appState.requestedDetail || '';

      if (appState.pendingTransition && appState.pendingTransition.state === next && appState.pendingTransition.detail === detail) {
        return;
      }

      if (!appState.pendingTransition && appState.currentState === next) {
        if (appState.currentDetail !== detail) {
          appState.currentDetail = detail;
          setStatusLine(appState, next, detail, { showBubble: false }, stateLabels, defaultDetails, ui);
        }
        return;
      }

      const blockedUntil = getTransitionBlockedUntil(appState, next);
      if (blockedUntil > Date.now() + 20) {
        appState.stateGateTimerId = setTimeout(() => {
          appState.stateGateTimerId = null;
          reconcileRequestedState(appState);
        }, Math.max(30, blockedUntil - Date.now()));
        return;
      }

      scheduleStateTransition(appState, next, detail);
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

        const detailText = (detail && String(detail).trim()) ? String(detail).trim() : (defaultDetails[next] || '');
        const stateChanged = next !== appState.requestedState;
        const detailChanged = detailText !== appState.requestedDetail;
        const requestChanged = stateChanged || detailChanged;
        appState.requestedState = next;
        appState.requestedDetail = detailText;

        if (stateChanged) {
          reconcileRequestedState(appState);
        } else if (requestChanged && !appState.pendingTransition) {
          if (appState.currentState === next) {
            appState.currentDetail = detailText;
            setStatusLine(appState, next, detailText, { showBubble: false }, stateLabels, defaultDetails, ui);
          }
        } else if (requestChanged) {
          reconcileRequestedState(appState);
        } else if (!appState.pendingTransition) {
          syncAudioRole(appState, !appState.pendingAudioState);
          if (!appState.pendingAudioState && appState.audioManager) appState.audioManager.ensureForState(next);
          tryPlayPendingStateAudio(appState);
          const line = deps.formatLine(next, detailText, stateLabels, defaultDetails);
          if (line !== appState.lastLine) setStatusLine(appState, next, detailText, { showBubble: false }, stateLabels, defaultDetails, ui);
        }
      } catch (e) {
        if (ui.statusText) ui.statusText.textContent = t('state.offlineLine', null, '[離線] 無法拉取狀態，請檢查 backend 是否已啟動 (http://127.0.0.1:18791)');
      }
    }

    return {
      applyVisualState,
      scheduleStateTransition,
      reconcileRequestedState,
      fetchStatusAndApply
    };
  }

  window.BrotherhoodStatusRuntime = {
    createStatusRuntime
  };
})();
