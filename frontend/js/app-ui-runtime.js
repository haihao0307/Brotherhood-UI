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

    const txt = scene.add.text(0, 0, text, {
      fontFamily: bubbleTextStyle.fontFamily,
      fontSize: bubbleTextStyle.fontSize + 'px',
      fontStyle: String(bubbleTextStyle.fontWeight),
      color: bubbleTextStyle.color,
      stroke: bubbleTextStyle.stroke,
      strokeThickness: bubbleTextStyle.strokeThickness,
      lineSpacing: bubbleTextStyle.lineSpacing,
      wordWrap: { width: bubbleTextStyle.maxW, useAdvancedWrap: true }
    }).setOrigin(0.5, 0.5);
    if (typeof txt.setResolution === 'function') {
      txt.setResolution(Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
    }
    txt.setPadding(
      bubbleTextStyle.textPadding,
      bubbleTextStyle.textPadding,
      bubbleTextStyle.textPadding,
      bubbleTextStyle.textPadding
    );

    const wrappedLines = typeof txt.getWrappedText === 'function'
      ? txt.getWrappedText(String(text || ''))
      : String(text || '').split(/\r?\n/);
    const lineCount = Math.max(1, Array.isArray(wrappedLines) ? wrappedLines.length : 1);
    const w = clamp(txt.width + bubbleTextStyle.padX * 2, 60, bubbleTextStyle.maxW + bubbleTextStyle.padX * 2);
    const h = Math.max(42, txt.height + bubbleTextStyle.padY * 2);
    const innerWidth = Math.max(0, w - bubbleTextStyle.padX * 2);
    const innerHeight = Math.max(0, h - bubbleTextStyle.padY * 2);
    const textFits = txt.width <= innerWidth && txt.height <= innerHeight;

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
    appState.bubble = {
      container: c,
      hideAt: scene.time.now + durationMs,
      speaker: speaker,
      heroId: opts.heroId || null,
      textStyle: bubbleTextStyle,
      debugLayout: {
        text: String(text || ''),
        bubbleWidth: w,
        bubbleHeight: h,
        textWidth: txt.width,
        textHeight: txt.height,
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
    const topY = hero.y - hero.displayHeight;
    bubble.container.x = hero.x;
    bubble.container.y = topY - 18;
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
    showBubble,
    updateBubblePos,
    setStatusLine
  };
})();
