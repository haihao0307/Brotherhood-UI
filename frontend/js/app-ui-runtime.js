(function () {
  'use strict';

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function getI18n() {
    return window.BrotherhoodI18n || null;
  }

  function t(key, params, fallback) {
    const i18n = getI18n();
    if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
    return fallback != null ? fallback : key;
  }

  function createUiRefs(doc) {
    return {
      coordsBtn: doc.getElementById('coordsBtn'),
      audioBtn: doc.getElementById('audioBtn'),
      hintText: doc.getElementById('hintText'),
      coordsText: doc.getElementById('coordsText'),
      statusText: doc.getElementById('statusLine'),
      statusHeadline: doc.getElementById('statusHeadline'),
      statusStage: doc.getElementById('statusStage'),
      statusFocus: doc.getElementById('statusFocus'),
      statusHistory: doc.getElementById('statusHistory'),
      statusMeta: doc.getElementById('statusMeta'),
      controlPanelSummary: doc.getElementById('controlPanelSummary'),
      memoPanelSummary: doc.getElementById('memoPanelSummary'),
      toolsToggle: doc.getElementById('toolsToggle'),
      toolsToggleLabel: doc.getElementById('toolsToggleLabel'),
      toolsLayer: doc.getElementById('toolsLayer'),
      toolsDrawer: doc.getElementById('toolsDrawer'),
      toolsBackdrop: doc.getElementById('toolsBackdrop'),
      toolsCloseBtn: doc.getElementById('toolsCloseBtn'),
      loadingOverlay: doc.getElementById('loading-overlay'),
      loadingTitle: doc.getElementById('loading-title'),
      loadingProgressBar: doc.getElementById('loading-progress-bar'),
      errorPanel: doc.getElementById('error-panel')
    };
  }

  function showLoadError(ui, msg) {
    ui.errorPanel.style.display = 'block';
    ui.errorPanel.textContent = msg;
  }

  function hideLoadingOverlay(ui) {
    ui.loadingOverlay.style.display = 'none';
  }

  function setLoadingProgress(ui, p01) {
    const p = clamp(Math.floor(p01 * 100), 0, 100);
    ui.loadingProgressBar.style.width = p + '%';
  }

  function formatLine(state, detail, stateLabels, defaultDetails) {
    const label = stateLabels[state] || state;
    const d = (detail && String(detail).trim()) ? String(detail).trim() : (defaultDetails[state] || '');
    return `[${label}] ${d}`;
  }

  function initCoordsToggle(ui, state) {
    function redraw() {
      ui.coordsBtn.textContent = state.coordsOn ? t('chrome.coords.buttonOn') : t('chrome.coords.buttonOff');
      ui.coordsBtn.title = t('chrome.coords.title');
      if (!state.coordsOn && (!state.lastPointer || state.lastPointer.x == null)) ui.coordsText.textContent = t('chrome.coords.unknown');
    }

    ui.coordsBtn.addEventListener('click', () => {
      state.coordsOn = !state.coordsOn;
      redraw();
    });
    redraw();
    const i18n = getI18n();
    if (i18n && typeof i18n.subscribe === 'function') {
      i18n.subscribe(redraw);
    }
  }

  function initAudioToggle(ui, state) {
    if (!ui.audioBtn) return;

    function redraw() {
      const available = !state.audioManager || !!state.audioManager.hasAny;
      if (!available) {
        ui.audioBtn.textContent = t('chrome.audio.buttonNA');
        ui.audioBtn.title = t('chrome.audio.title');
        ui.audioBtn.disabled = true;
        return;
      }
      ui.audioBtn.disabled = false;
      ui.audioBtn.textContent = state.audioEnabled ? t('chrome.audio.buttonOn') : t('chrome.audio.buttonOff');
      ui.audioBtn.title = t('chrome.audio.title');
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
    const i18n = getI18n();
    if (i18n && typeof i18n.subscribe === 'function') {
      i18n.subscribe(redraw);
    }
  }

  function initToolsDrawer(ui, state) {
    if (!ui.toolsToggle || !ui.toolsLayer || !ui.toolsDrawer) return;

    function redraw() {
      const open = !!state.toolsOpen;
      ui.toolsLayer.hidden = !open;
      ui.toolsLayer.classList.toggle('is-open', open);
      ui.toolsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (ui.toolsToggleLabel) ui.toolsToggleLabel.textContent = open ? t('chrome.toolsClose') : t('chrome.toolsOpen');
    }

    function openDrawer() {
      state.toolsOpen = true;
      redraw();
    }

    function closeDrawer() {
      state.toolsOpen = false;
      redraw();
    }

    ui.toolsToggle.addEventListener('click', () => {
      if (state.toolsOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
    if (ui.toolsBackdrop) ui.toolsBackdrop.addEventListener('click', closeDrawer);
    if (ui.toolsCloseBtn) ui.toolsCloseBtn.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.toolsOpen) {
        closeDrawer();
        ui.toolsToggle.focus();
      }
    });
    redraw();
    const i18n = getI18n();
    if (i18n && typeof i18n.subscribe === 'function') {
      i18n.subscribe(redraw);
    }
  }

  function clearCurrentBubble(appState) {
    if (appState.bubble && appState.bubble.container) appState.bubble.container.destroy();
    if (appState.bubble && appState.bubble.domNode && appState.bubble.domNode.parentNode) {
      appState.bubble.domNode.parentNode.removeChild(appState.bubble.domNode);
    }
    appState.bubble = null;
  }

  function detectBubblePlatform(win) {
    const nav = win && win.navigator ? win.navigator : {};
    const raw = String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || '').toLowerCase();
    if (raw.includes('mac')) return 'macos';
    if (raw.includes('win')) return 'windows';
    return 'default';
  }

  function getBubbleTextStyle(win) {
    const platformPreset = detectBubblePlatform(win);
    const base = {
      platformPreset,
      fontFamily: '"PingFang TC", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "Source Han Sans TC", sans-serif',
      fontSize: 19,
      fontWeight: 600,
      lineSpacing: 6,
      stroke: '#fff7e4',
      strokeThickness: 0,
      padX: 18,
      padY: 12,
      maxW: 448,
      color: '#17110b',
      textPadding: 1
    };
    if (platformPreset === 'windows') {
      return {
        ...base,
        fontFamily: '"Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", "Source Han Sans TC", sans-serif',
        fontSize: 20,
        lineSpacing: 7
      };
    }
    if (platformPreset === 'macos') {
      return {
        ...base,
        fontFamily: '"PingFang TC", "SF Pro Text", "Noto Sans TC", "Source Han Sans TC", sans-serif'
      };
    }
    return base;
  }

  function getBubbleAnchor(hero) {
    const topY = hero.y - hero.displayHeight;
    return {
      anchorX: hero.x,
      anchorY: topY - 18
    };
  }

  function getBubbleViewportMetrics(appState) {
    const scene = appState && appState.sceneRef ? appState.sceneRef : null;
    const canvas = scene && scene.game ? scene.game.canvas : null;
    if (!scene || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    const sceneWidth = scene.scale && scene.scale.width ? scene.scale.width : canvas.width;
    const sceneHeight = scene.scale && scene.scale.height ? scene.scale.height : canvas.height;
    if (!sceneWidth || !sceneHeight) return null;
    return {
      rect,
      sceneWidth,
      sceneHeight,
      viewportWidthPx: rect.width,
      viewportHeightPx: rect.height,
      scaleX: rect.width / sceneWidth,
      scaleY: rect.height / sceneHeight
    };
  }

  function getBubbleDomPosition(appState, hero) {
    const viewport = getBubbleViewportMetrics(appState);
    if (!viewport || !hero) return null;
    const anchor = getBubbleAnchor(hero);
    return {
      anchorX: anchor.anchorX,
      anchorY: anchor.anchorY,
      domLeft: anchor.anchorX * viewport.scaleX,
      domTop: anchor.anchorY * viewport.scaleY,
      scaleX: viewport.scaleX,
      scaleY: viewport.scaleY,
      sceneWidth: viewport.sceneWidth,
      sceneHeight: viewport.sceneHeight,
      viewportWidthPx: viewport.viewportWidthPx,
      viewportHeightPx: viewport.viewportHeightPx
    };
  }

  function getBubbleMeasurementMaxWidthPx(options) {
    const opts = options || {};
    const requestedMaxWidthPx = Math.max(0, Number(opts.requestedMaxWidthPx || 0));
    const viewportWidthPx = Math.max(0, Number(opts.viewportWidthPx || 0));
    const sceneWidthPx = Math.max(0, Number(opts.sceneWidthPx || viewportWidthPx));
    const marginPx = Math.max(0, Number(opts.marginPx || 0));
    const visibleBudgetPx = Math.max(0, Math.min(viewportWidthPx || requestedMaxWidthPx, sceneWidthPx || requestedMaxWidthPx) - marginPx * 2);
    if (!visibleBudgetPx) return requestedMaxWidthPx;
    if (!requestedMaxWidthPx) return visibleBudgetPx;
    return Math.max(48, Math.min(requestedMaxWidthPx, visibleBudgetPx));
  }

  function getBubbleDomMetrics(domNode, bubbleTextStyle) {
    if (!domNode) {
      return {
        domWidth: 0,
        domHeight: 0,
        boxWidthPx: 0,
        boxHeightPx: 0,
        contentWidthPx: 0,
        contentHeightPx: 0,
        paddingLeftPx: bubbleTextStyle ? bubbleTextStyle.padX : 0,
        paddingRightPx: bubbleTextStyle ? bubbleTextStyle.padX : 0,
        paddingTopPx: bubbleTextStyle ? bubbleTextStyle.padY : 0,
        paddingBottomPx: bubbleTextStyle ? bubbleTextStyle.padY : 0,
        lineCount: 1
      };
    }
    const rect = domNode.getBoundingClientRect();
    const computed = window.getComputedStyle(domNode);
    const computedLineHeight = parseFloat(computed.lineHeight);
    const paddingLeftPx = Number.parseFloat(computed.paddingLeft || String((bubbleTextStyle && bubbleTextStyle.padX) || 0)) || 0;
    const paddingRightPx = Number.parseFloat(computed.paddingRight || String((bubbleTextStyle && bubbleTextStyle.padX) || 0)) || 0;
    const paddingTopPx = Number.parseFloat(computed.paddingTop || String((bubbleTextStyle && bubbleTextStyle.padY) || 0)) || 0;
    const paddingBottomPx = Number.parseFloat(computed.paddingBottom || String((bubbleTextStyle && bubbleTextStyle.padY) || 0)) || 0;
    const fallbackLineHeight = bubbleTextStyle.fontSize * 1.45;
    const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : fallbackLineHeight;
    const domWidth = Math.ceil(rect.width || 0);
    const domHeight = Math.ceil(rect.height || 0);
    const contentWidthPx = Math.max(0, domWidth - paddingLeftPx - paddingRightPx);
    const contentHeightPx = Math.max(0, domHeight - paddingTopPx - paddingBottomPx);
    return {
      domWidth: domWidth,
      domHeight: domHeight,
      boxWidthPx: domWidth,
      boxHeightPx: domHeight,
      contentWidthPx: contentWidthPx,
      contentHeightPx: contentHeightPx,
      paddingLeftPx: paddingLeftPx,
      paddingRightPx: paddingRightPx,
      paddingTopPx: paddingTopPx,
      paddingBottomPx: paddingBottomPx,
      lineCount: Math.max(1, lineHeight > 0 ? Math.round(contentHeightPx / lineHeight) : 1)
    };
  }

  function resolveBubbleSceneMetrics(options) {
    const opts = options || {};
    const scaleX = Math.max(0.0001, Number(opts.scaleX || 1));
    const scaleY = Math.max(0.0001, Number(opts.scaleY || 1));
    const boxWidthPx = Math.max(0, Number(opts.boxWidthPx || 0));
    const boxHeightPx = Math.max(0, Number(opts.boxHeightPx || 0));
    const minWidthScene = Math.max(0, Number(opts.minWidthScene || 0));
    const minHeightScene = Math.max(0, Number(opts.minHeightScene || 0));
    return {
      boxWidthPx: boxWidthPx,
      boxHeightPx: boxHeightPx,
      bubbleWidthScene: Math.max(minWidthScene, boxWidthPx / scaleX),
      bubbleHeightScene: Math.max(minHeightScene, boxHeightPx / scaleY)
    };
  }

  function computeBubblePlacement(options) {
    const opts = options || {};
    const anchorX = Number(opts.anchorX || 0);
    const anchorY = Number(opts.anchorY || 0);
    const bubbleWidth = Math.max(0, Number(opts.bubbleWidth || 0));
    const bubbleHeight = Math.max(0, Number(opts.bubbleHeight || 0));
    const sceneWidth = Math.max(0, Number(opts.sceneWidth || 0));
    const sceneHeight = Math.max(0, Number(opts.sceneHeight || 0));
    const margin = Math.max(0, Number(opts.margin || 0));
    const tailHeight = Math.max(0, Number(opts.tailHeight || 0));
    const tailInset = Math.max(0, Number(opts.tailInset || 0));
    const minLeft = margin;
    const maxLeft = Math.max(margin, sceneWidth - bubbleWidth - margin);
    const minTop = margin;
    const maxTop = Math.max(margin, sceneHeight - bubbleHeight - tailHeight - margin);
    const bubbleLeft = clamp(anchorX - (bubbleWidth / 2), minLeft, maxLeft);
    const bubbleTop = clamp(anchorY - bubbleHeight - tailHeight, minTop, maxTop);
    const minTailTipX = bubbleLeft + tailInset;
    const maxTailTipX = bubbleLeft + bubbleWidth - tailInset;
    const tailTipX = clamp(anchorX, minTailTipX, maxTailTipX);
    return {
      bubbleLeft: bubbleLeft,
      bubbleTop: bubbleTop,
      tailTipX: tailTipX,
      tailTipXLocal: tailTipX - bubbleLeft
    };
  }

  function renderBubbleGraphics(graphics, sceneMetrics, layout, options) {
    if (!graphics || !sceneMetrics || !layout) return;
    const opts = options || {};
    const bubbleWidth = Math.max(0, Number(sceneMetrics.bubbleWidthScene || 0));
    const bubbleHeight = Math.max(0, Number(sceneMetrics.bubbleHeightScene || 0));
    const cornerRadius = Math.max(0, Number(opts.cornerRadius || 6));
    const tailHalfWidth = Math.max(0, Number(opts.tailHalfWidth || 10));
    const tailHeight = Math.max(0, Number(opts.tailHeight || 12));
    const tailTipXLocal = clamp(Number(layout.tailTipXLocal || bubbleWidth / 2), tailHalfWidth, Math.max(tailHalfWidth, bubbleWidth - tailHalfWidth));
    graphics.clear();
    graphics.fillStyle(0xfff7d6, 0.98);
    graphics.lineStyle(3, 0x1b1b1b, 1);
    graphics.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, cornerRadius);
    graphics.strokeRoundedRect(0, 0, bubbleWidth, bubbleHeight, cornerRadius);
    graphics.fillTriangle(
      tailTipXLocal - tailHalfWidth,
      bubbleHeight - 2,
      tailTipXLocal + tailHalfWidth,
      bubbleHeight - 2,
      tailTipXLocal,
      bubbleHeight + tailHeight
    );
    graphics.strokeTriangle(
      tailTipXLocal - tailHalfWidth,
      bubbleHeight - 2,
      tailTipXLocal + tailHalfWidth,
      bubbleHeight - 2,
      tailTipXLocal,
      bubbleHeight + tailHeight
    );
  }

  function applyBubbleDomLayout(domNode, layout, sceneMetrics, domPosition) {
    if (!domNode || !layout || !sceneMetrics || !domPosition) return;
    domNode.style.left = (layout.bubbleLeft * domPosition.scaleX) + 'px';
    domNode.style.top = (layout.bubbleTop * domPosition.scaleY) + 'px';
    domNode.style.width = (sceneMetrics.bubbleWidthScene * domPosition.scaleX) + 'px';
    domNode.style.height = (sceneMetrics.bubbleHeightScene * domPosition.scaleY) + 'px';
    domNode.style.visibility = 'visible';
  }

  function showBubble(appState, text, options) {
    const scene = appState.sceneRef;
    const opts = options || {};
    const speaker = opts.speaker === 'support' ? 'support' : 'main';
    const hero = appState.engine && opts.heroId && typeof appState.engine.getActorByHeroId === 'function'
      ? appState.engine.getActorByHeroId(opts.heroId)
      : (appState.engine && typeof appState.engine.getActorForSpeaker === 'function'
        ? appState.engine.getActorForSpeaker(speaker)
        : (appState.engine && appState.engine.hero));
    if (!scene || !hero) return;
    clearCurrentBubble(appState);

    const bubbleTextStyle = getBubbleTextStyle(window);
    const domPosition = getBubbleDomPosition(appState, hero);
    const measurementMaxWidthPx = getBubbleMeasurementMaxWidthPx({
      viewportWidthPx: domPosition ? domPosition.viewportWidthPx : bubbleTextStyle.maxW,
      sceneWidthPx: domPosition ? domPosition.viewportWidthPx : bubbleTextStyle.maxW,
      requestedMaxWidthPx: bubbleTextStyle.maxW,
      marginPx: 8
    });

    const domNode = appState.bubbleOverlayRoot && typeof document !== 'undefined'
      ? document.createElement('div')
      : null;
    if (domNode && appState.bubbleOverlayRoot) {
      domNode.className = 'bubble-text-overlay';
      domNode.textContent = String(text || '');
      domNode.setAttribute('data-platform-preset', bubbleTextStyle.platformPreset);
      domNode.style.maxWidth = measurementMaxWidthPx + 'px';
      domNode.style.visibility = 'hidden';
      appState.bubbleOverlayRoot.appendChild(domNode);
    }

    const domMetrics = getBubbleDomMetrics(domNode, bubbleTextStyle);
    const sceneMetrics = resolveBubbleSceneMetrics({
      boxWidthPx: domMetrics.boxWidthPx,
      boxHeightPx: domMetrics.boxHeightPx,
      scaleX: domPosition ? domPosition.scaleX : 1,
      scaleY: domPosition ? domPosition.scaleY : 1,
      minWidthScene: 60,
      minHeightScene: 42
    });
    const lineCount = domMetrics.lineCount;
    const textFits = domMetrics.boxWidthPx <= measurementMaxWidthPx;
    const anchor = getBubbleAnchor(hero);
    const layout = computeBubblePlacement({
      anchorX: anchor.anchorX,
      anchorY: anchor.anchorY,
      bubbleWidth: sceneMetrics.bubbleWidthScene,
      bubbleHeight: sceneMetrics.bubbleHeightScene,
      sceneWidth: domPosition ? domPosition.sceneWidth : scene.scale.width,
      sceneHeight: domPosition ? domPosition.sceneHeight : scene.scale.height,
      margin: 8,
      tailHeight: 12,
      tailInset: 18
    });

    const g = scene.add.graphics();
    renderBubbleGraphics(g, sceneMetrics, layout, {
      cornerRadius: 6,
      tailHalfWidth: 10,
      tailHeight: 12
    });

    const c = scene.add.container(0, 0, [g]);
    c.setDepth(9999);

    const durationMs = Math.max(600, Number(opts.durationMs || 6500));
    appState.bubble = {
      container: c,
      graphics: g,
      domNode: domNode,
      hideAt: scene.time.now + durationMs,
      speaker: speaker,
      heroId: opts.heroId || null,
      textStyle: bubbleTextStyle,
      sceneMetrics: sceneMetrics,
      layout: layout,
      debugLayout: {
        text: String(text || ''),
        anchorX: anchor.anchorX,
        anchorY: anchor.anchorY,
        bubbleLeft: layout.bubbleLeft,
        bubbleTop: layout.bubbleTop,
        tailTipX: layout.tailTipX,
        domWidth: domMetrics.boxWidthPx,
        domHeight: domMetrics.boxHeightPx,
        bubbleWidth: sceneMetrics.bubbleWidthScene,
        bubbleHeight: sceneMetrics.bubbleHeightScene,
        textWidth: domMetrics.contentWidthPx,
        textHeight: domMetrics.contentHeightPx,
        lineCount: lineCount,
        textFits: textFits
      }
    };
    updateBubblePos(appState);
  }

  function updateBubblePos(appState) {
    const scene = appState.sceneRef;
    const bubble = appState.bubble;
    const hero = appState.engine && bubble && bubble.heroId && typeof appState.engine.getActorByHeroId === 'function'
      ? appState.engine.getActorByHeroId(bubble.heroId)
      : (appState.engine && bubble && typeof appState.engine.getActorForSpeaker === 'function'
        ? appState.engine.getActorForSpeaker(bubble.speaker || 'main')
        : (appState.engine && appState.engine.hero));
    if (!scene || !hero || !bubble || !bubble.container) return;
    const domPosition = getBubbleDomPosition(appState, hero);
    const anchor = getBubbleAnchor(hero);
    const sceneMetrics = bubble.sceneMetrics || resolveBubbleSceneMetrics({
      boxWidthPx: bubble.debugLayout ? bubble.debugLayout.domWidth : 0,
      boxHeightPx: bubble.debugLayout ? bubble.debugLayout.domHeight : 0,
      scaleX: domPosition ? domPosition.scaleX : 1,
      scaleY: domPosition ? domPosition.scaleY : 1,
      minWidthScene: 60,
      minHeightScene: 42
    });
    const layout = computeBubblePlacement({
      anchorX: anchor.anchorX,
      anchorY: anchor.anchorY,
      bubbleWidth: sceneMetrics.bubbleWidthScene,
      bubbleHeight: sceneMetrics.bubbleHeightScene,
      sceneWidth: domPosition ? domPosition.sceneWidth : scene.scale.width,
      sceneHeight: domPosition ? domPosition.sceneHeight : scene.scale.height,
      margin: 8,
      tailHeight: 12,
      tailInset: 18
    });
    bubble.sceneMetrics = sceneMetrics;
    bubble.layout = layout;
    if (bubble.graphics) {
      renderBubbleGraphics(bubble.graphics, sceneMetrics, layout, {
        cornerRadius: 6,
        tailHalfWidth: 10,
        tailHeight: 12
      });
    }
    bubble.container.x = layout.bubbleLeft;
    bubble.container.y = layout.bubbleTop;
    if (bubble.domNode && domPosition) {
      applyBubbleDomLayout(bubble.domNode, layout, sceneMetrics, domPosition);
    }
    if (bubble.debugLayout) {
      const domMetrics = getBubbleDomMetrics(bubble.domNode, bubble.textStyle || getBubbleTextStyle(window));
      bubble.debugLayout.anchorX = anchor.anchorX;
      bubble.debugLayout.anchorY = anchor.anchorY;
      bubble.debugLayout.bubbleLeft = layout.bubbleLeft;
      bubble.debugLayout.bubbleTop = layout.bubbleTop;
      bubble.debugLayout.tailTipX = layout.tailTipX;
      bubble.debugLayout.domLeft = domPosition ? layout.bubbleLeft * domPosition.scaleX : 0;
      bubble.debugLayout.domTop = domPosition ? layout.bubbleTop * domPosition.scaleY : 0;
      bubble.debugLayout.domWidth = domMetrics.boxWidthPx;
      bubble.debugLayout.domHeight = domMetrics.boxHeightPx;
      bubble.debugLayout.bubbleWidth = sceneMetrics.bubbleWidthScene;
      bubble.debugLayout.bubbleHeight = sceneMetrics.bubbleHeightScene;
      bubble.debugLayout.textWidth = domMetrics.contentWidthPx;
      bubble.debugLayout.textHeight = domMetrics.contentHeightPx;
      bubble.debugLayout.lineCount = domMetrics.lineCount;
      bubble.debugLayout.textFits = bubble.debugLayout.textFits !== false;
    }
  }

  function setStatusLine(appState, state, detail, options, stateLabels, defaultDetails, ui) {
    const opts = options || {};
    const line = formatLine(state, detail, stateLabels, defaultDetails);
    appState.lastLine = line;
    if (ui.statusText) ui.statusText.textContent = line;
    if (opts.showBubble !== false) showBubble(appState, line);
  }

  window.BrotherhoodAppUi = {
    clamp,
    createUiRefs,
    showLoadError,
    hideLoadingOverlay,
    setLoadingProgress,
    formatLine,
    initCoordsToggle,
    initAudioToggle,
    initToolsDrawer,
    clearCurrentBubble,
    getBubbleMeasurementMaxWidthPx,
    resolveBubbleSceneMetrics,
    computeBubblePlacement,
    showBubble,
    updateBubblePos,
    setStatusLine
  };
})();
