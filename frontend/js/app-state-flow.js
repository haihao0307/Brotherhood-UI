(function () {
  'use strict';

  function getStateFlowConfig(themeConfig) {
    const node = (themeConfig && themeConfig.stateFlow && typeof themeConfig.stateFlow === 'object')
      ? themeConfig.stateFlow
      : {};
    return {
      minIdleMs: Math.max(0, Number(node.minIdleMs || 900)),
      minChildSceneMs: Math.max(0, Number(node.minChildSceneMs || 2600)),
      minHandoffMs: Math.max(0, Number(node.minHandoffMs || 0))
    };
  }

  function getEffectiveWorkflowState(appState) {
    if (appState && appState.pendingTransition && appState.pendingTransition.state) {
      return appState.pendingTransition.state;
    }
    return (appState && appState.currentState) ? appState.currentState : 'idle';
  }

  function resolveScenePhase(appState) {
    if (!appState || !appState.currentState) return 'boot';
    if (appState.pendingTransition) return 'main_handoff';
    if (appState.engine && typeof appState.engine.isChildSceneActive === 'function' && appState.engine.isChildSceneActive()) {
      return 'child_active';
    }
    return appState.currentState === 'idle' ? 'main_idle' : 'child_active';
  }

  function resolveDialogueMode(appState) {
    const scenePhase = resolveScenePhase(appState);
    const workflowState = getEffectiveWorkflowState(appState);
    if (scenePhase === 'main_handoff' && workflowState !== 'idle') return 'handoff';
    if (scenePhase === 'main_idle' && workflowState === 'idle') return 'idle_event';
    if (scenePhase === 'child_active' && workflowState !== 'idle') return 'worker_loop';
    return 'none';
  }

  function getTransitionBlockedUntil(appState, nextState) {
    const cfg = getStateFlowConfig(appState.themeConfig);
    const now = Date.now();
    let blockedUntil = now;
    if (appState.pendingTransition && appState.pendingTransition.readyAt) {
      blockedUntil = Math.max(blockedUntil, Number(appState.pendingTransition.readyAt));
    }
    if (appState.scenePhase === 'child_active' && appState.currentState && appState.currentState !== 'idle' && nextState !== appState.currentState) {
      blockedUntil = Math.max(blockedUntil, Number(appState.childSceneEnteredAt || 0) + cfg.minChildSceneMs);
    }
    if (appState.currentState === 'idle' && nextState !== 'idle') {
      blockedUntil = Math.max(blockedUntil, Number(appState.idleSceneEnteredAt || 0) + cfg.minIdleMs);
    }
    return blockedUntil;
  }

  window.BrotherhoodStateFlow = {
    getStateFlowConfig,
    getEffectiveWorkflowState,
    resolveScenePhase,
    resolveDialogueMode,
    getTransitionBlockedUntil
  };
})();
