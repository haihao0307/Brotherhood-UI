(function () {
  'use strict';

  function createNarrativeStatusRuntime(deps) {
    const ui = deps.ui || {};
    const stateLabels = deps.stateLabels || {};
    const defaultDetails = deps.defaultDetails || {};
    const fallbackHeroNames = {
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

    const stateHeroIdMap = {
      idle: 'songjiang',
      writing: 'wuyong',
      researching: 'sunerniang',
      executing: 'wusong',
      syncing: 'linchong',
      error: 'luzhishen'
    };

    const heroAliasMap = {
      songjiang: 'songjiang',
      song_jiang: 'songjiang',
      'song-jiang': 'songjiang',
      宋江: 'songjiang',
      wuyong: 'wuyong',
      wu_yong: 'wuyong',
      'wu-yong': 'wuyong',
      吳用: 'wuyong',
      吴用: 'wuyong',
      sunerniang: 'sunerniang',
      sun_erniang: 'sunerniang',
      'sun-erniang': 'sunerniang',
      sunerniang: 'sunerniang',
      孫二娘: 'sunerniang',
      孙二娘: 'sunerniang',
      wusong: 'wusong',
      wu_song: 'wusong',
      'wu-song': 'wusong',
      武松: 'wusong',
      linchong: 'linchong',
      lin_chong: 'linchong',
      'lin-chong': 'linchong',
      林沖: 'linchong',
      林冲: 'linchong',
      luzhishen: 'luzhishen',
      lu_zhishen: 'luzhishen',
      'lu-zhishen': 'luzhishen',
      魯智深: 'luzhishen',
      鲁智深: 'luzhishen'
    };

    const runtime = {
      feed: null,
      renderTimerId: null,
      refreshTimerId: null,
      lastSignature: ''
    };

    function t(key, params, fallback) {
      const i18n = deps.i18n || window.BrotherhoodI18n;
      if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
      return fallback != null ? fallback : key;
    }

    function stateLabel(state) {
      return stateLabels[state] || state || '待命';
    }

    function defaultDetail(state) {
      return defaultDetails[state] || '';
    }

    function normalizeHeroKey(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const lowered = raw.toLowerCase();
      return heroAliasMap[raw] || heroAliasMap[lowered] || heroAliasMap[lowered.replace(/[\s_-]+/g, '')] || lowered;
    }

    function readHeroName(key) {
      if (!key) return '';
      const names = deps.heroNames || {};
      const dynamicValue = names[key];
      if (dynamicValue && String(dynamicValue).trim()) return String(dynamicValue).trim();
      const fallbackValue = fallbackHeroNames[key];
      return fallbackValue && String(fallbackValue).trim() ? String(fallbackValue).trim() : '';
    }

    function defaultHeroIdForState(state) {
      const key = String(state || 'idle').trim().toLowerCase();
      return stateHeroIdMap[key] || stateHeroIdMap.idle;
    }

    function formatClock(value) {
      if (!value) return '--:--:--';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '--:--:--';
      const locale = (deps.i18n && typeof deps.i18n.getLocale === 'function')
        ? deps.i18n.getLocale()
        : ((window.BrotherhoodI18n && typeof window.BrotherhoodI18n.getLocale === 'function')
          ? window.BrotherhoodI18n.getLocale()
          : 'zh-Hant');
      return date.toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-Hant', { hour12: false });
    }

    function workerHeroNameForState(state, fallbackHero) {
      const key = String(state || 'idle').trim().toLowerCase();
      const mappedHeroId = defaultHeroIdForState(key);
      const mappedHero = heroNameForId(mappedHeroId) || readHeroName(key) || readHeroName('idle') || '宋江';
      const fallback = fallbackHero && String(fallbackHero).trim() ? String(fallbackHero).trim() : '';
      if (!fallback) return mappedHero;
      const fallbackHeroId = normalizeHeroKey(fallback);
      const fallbackDisplay = heroNameForId(fallback) || fallback;
      if (key !== 'idle' && fallbackHeroId === defaultHeroIdForState('idle') && mappedHero !== fallbackDisplay) return mappedHero;
      return fallbackHeroId ? fallbackDisplay : mappedHero;
    }

    function heroNameForId(heroId) {
      if (!heroId) return '';
      const key = normalizeHeroKey(heroId);
      return readHeroName(key) || String(heroId).trim();
    }

    function getCurrentWorkerHeroId(appState) {
      if (!appState || !appState.engine || typeof appState.engine.getCurrentWorkerHeroId !== 'function') return null;
      return appState.engine.getCurrentWorkerHeroId();
    }

    function getHighlightedHeroName(appState) {
      if (!appState) return '';
      if (appState.activeIdleEventHeroId) return heroNameForId(appState.activeIdleEventHeroId);
      if (appState.bubble && appState.bubble.heroId) return heroNameForId(appState.bubble.heroId);
      return '';
    }

    function deriveHeadline(appState, feed) {
      const current = (feed && feed.current) || {};
      const currentState = String((appState && appState.currentState) || current.state || 'idle');
      const requestedState = String((appState && appState.requestedState) || current.state || currentState || 'idle');
      const pending = !!(appState && appState.pendingTransition);
      const scenePhase = (appState && appState.scenePhase) || 'boot';
      const dialogueMode = (appState && appState.dialogueMode) || 'none';
      const workerHero = workerHeroNameForState(currentState, current.hero);
      const requestedHero = workerHeroNameForState(requestedState, current.hero);
      const highlightedHero = getHighlightedHeroName(appState);

      if (pending || scenePhase === 'main_handoff') {
        return t('narrative.headline.handoff', { hero: requestedHero });
      }
      if (requestedState === 'error' || currentState === 'error') {
        return t('narrative.headline.error', { hero: workerHero });
      }
      if (scenePhase === 'child_active' && currentState !== 'idle') {
        if (currentState === 'writing') return t('narrative.headline.writing', { hero: workerHero });
        if (currentState === 'researching') return t('narrative.headline.researching', { hero: workerHero });
        if (currentState === 'executing') return t('narrative.headline.executing', { hero: workerHero });
        if (currentState === 'syncing') return t('narrative.headline.syncing', { hero: workerHero });
      }
      if (scenePhase === 'main_idle' && dialogueMode === 'idle_event' && highlightedHero && highlightedHero !== heroNameForId(defaultHeroIdForState('idle'))) {
        return t('narrative.headline.idleHighlight', { hero: highlightedHero });
      }
      return t('narrative.headline.idle');
    }

    function deriveStageNarration(appState, feed) {
      const current = (feed && feed.current) || {};
      const currentState = String((appState && appState.currentState) || current.state || 'idle');
      const requestedState = String((appState && appState.requestedState) || current.state || currentState || 'idle');
      const scenePhase = (appState && appState.scenePhase) || 'boot';
      const dialogueMode = (appState && appState.dialogueMode) || 'none';
      const workerHero = workerHeroNameForState(currentState, current.hero);
      const requestedHero = workerHeroNameForState(requestedState, current.hero);
      const highlightedHero = getHighlightedHeroName(appState);

      if (scenePhase === 'main_handoff') {
        return t('narrative.stage.handoff', { hero: requestedHero });
      }
      if (currentState === 'error' || requestedState === 'error') {
        return t('narrative.stage.error', { hero: workerHero });
      }
      if (scenePhase === 'child_active' && currentState !== 'idle') {
        return t('narrative.stage.child', { hero: workerHero, state: stateLabel(currentState) });
      }
      if (scenePhase === 'main_idle' && dialogueMode === 'idle_event') {
        if (highlightedHero && highlightedHero !== heroNameForId(defaultHeroIdForState('idle'))) {
          return t('narrative.stage.idleHighlight', { hero: highlightedHero });
        }
        return t('narrative.stage.idle');
      }
      return t('narrative.stage.default');
    }

    function deriveFocusLines(appState, feed) {
      const current = (feed && feed.current) || {};
      const watcher = (feed && feed.watcher) || {};
      const currentState = String((appState && appState.currentState) || current.state || 'idle');
      const requestedState = String((appState && appState.requestedState) || current.state || currentState || 'idle');
      const detail = String((appState && appState.currentDetail) || current.detail || defaultDetail(requestedState)).trim() || defaultDetail(requestedState);
      const lines = [];
      const activeWorkerHero = workerHeroNameForState(currentState, current.hero);
      const requestedHero = workerHeroNameForState(requestedState, current.hero);
      const scenePhase = (appState && appState.scenePhase) || 'boot';

      lines.push(t('narrative.focus.currentTask', { detail: detail }));

      if (scenePhase === 'main_handoff' || (appState && appState.pendingTransition)) {
        lines.push(t('narrative.focus.handoff', { hero: requestedHero }));
      } else if (scenePhase === 'child_active' && currentState !== 'idle') {
        lines.push(t('narrative.focus.activeWorker', { hero: activeWorkerHero, state: stateLabel(currentState) }));
      } else if ((appState && appState.dialogueMode) === 'idle_event') {
        const highlightedHero = getHighlightedHeroName(appState);
        lines.push(highlightedHero && highlightedHero !== heroNameForId(defaultHeroIdForState('idle'))
          ? t('narrative.focus.idleHighlight', { hero: highlightedHero })
          : t('narrative.focus.idle'));
      } else {
        lines.push(t('narrative.focus.default'));
      }

      if (watcher.lastObservedActivity) {
        lines.push(t('narrative.focus.watcherActive', { activity: String(watcher.lastObservedActivity).trim() }));
      } else if (watcher.status && watcher.status !== 'offline') {
        lines.push(t('narrative.focus.watcherOnline'));
      } else {
        lines.push(t('narrative.focus.watcherOffline'));
      }

      return lines.slice(0, 3).join('\n');
    }

    function deriveMeta(feed) {
      const current = (feed && feed.current) || {};
      const watcher = (feed && feed.watcher) || {};
      const source = current.source || 'unknown';
      const watcherMode = watcher.protocolMode ? t('state.watcherMode', { mode: watcher.protocolMode }) : '';
      const bridge = watcher.lastBridgeCommand ? t('state.recentBridge', { command: watcher.lastBridgeCommand }) : '';
      return t('state.metaLine', {
        source: source,
        time: formatClock(current.updated_at),
        watcherMode: watcherMode,
        bridge: bridge
      });
    }

    function historyBadge(item) {
      const label = stateLabel(item.state);
      const type = String(item.eventType || 'phase');
      const typeLabelMap = {
        start: t('state.historyTypes.start'),
        phase: t('state.historyTypes.phase'),
        done: t('state.historyTypes.done'),
        fail: t('state.historyTypes.fail'),
        auto_idle: t('state.historyTypes.auto_idle'),
        api_set: t('state.historyTypes.api_set'),
        route_apply: t('state.historyTypes.route_apply'),
        manual_set: t('state.historyTypes.manual_set')
      };
      return label + ' · ' + (typeLabelMap[type] || type);
    }

    function renderHistory(feed) {
      if (!ui.statusHistory) return '';
      const items = (feed && Array.isArray(feed.history)) ? feed.history : [];
      if (!items.length) {
        return '<div class="status-history-empty">' + escapeHtml(t('state.historyEmpty')) + '</div>';
      }
      return items.slice(0, 3).map((item) => {
        const detail = String(item.detail || '').trim() || t('state.historyEntered', { state: stateLabel(item.state) });
        const currentMark = item.isCurrentRequest ? (' · ' + t('state.historyCurrent')) : '';
        return [
          '<div class="status-history-item">',
          '<div class="status-history-head">',
          '<span class="status-history-badge">' + historyBadge(item) + currentMark + '</span>',
          '<span class="status-history-time">' + formatClock(item.updatedAt) + '</span>',
          '</div>',
          '<div class="status-history-detail">' + escapeHtml(detail) + '</div>',
          '</div>'
        ].join('');
      }).join('');
    }

    function escapeHtml(text) {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function updatePanelSummary(appState, feed) {
      const current = (feed && feed.current) || {};
      const summaryState = String(
        (appState && appState.pendingTransition && appState.pendingTransition.state) ||
        (appState && appState.requestedState) ||
        (appState && appState.currentState) ||
        current.state ||
        'idle'
      );
      const detail = String(
        (appState && appState.requestedDetail) ||
        (appState && appState.currentDetail) ||
        current.detail ||
        ''
      ).trim();
      const hasManualDetail = !!detail && detail !== defaultDetail(summaryState);
      if (ui.controlPanelSummary) {
        ui.controlPanelSummary.textContent = t('control.summary', {
          state: stateLabel(summaryState),
          detailState: hasManualDetail ? t('control.summaryHasDetail') : t('control.summaryNoDetail')
        });
      }

      const memoSummary = feed && feed.memoSummary ? feed.memoSummary : null;
      if (ui.memoPanelSummary) {
        if (memoSummary && memoSummary.hasMemo) {
          ui.memoPanelSummary.textContent = t('memo.summary', {
            date: memoSummary.date,
            summary: memoSummary.summary || t('memo.loadedFallback')
          });
        } else {
          ui.memoPanelSummary.textContent = t('memo.empty');
        }
      }
    }

    function setPanelExpanded(panel, expanded) {
      if (!panel || !panel.root || !panel.button || !panel.body || !panel.hint) return;
      panel.root.classList.toggle('is-collapsed', !expanded);
      panel.button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      panel.body.hidden = !expanded;
      panel.hint.textContent = expanded ? t('drawer.close') : t('drawer.open');
    }

    function setupPanelToggle(rootId, buttonId, bodyId) {
      const root = document.getElementById(rootId);
      const button = document.getElementById(buttonId);
      const body = document.getElementById(bodyId);
      if (!root || !button || !body) return;
      const hint = button.querySelector('.panel-toggle-hint');
      const panel = { root: root, button: button, body: body, hint: hint };
      setPanelExpanded(panel, false);
      button.addEventListener('click', function () {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        setPanelExpanded(panel, !expanded);
      });
    }

    function refreshPanelHints() {
      ['controlPanelToggle', 'memoPanelToggle'].forEach(function (buttonId) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        const hint = button.querySelector('.panel-toggle-hint');
        if (!hint) return;
        const expanded = button.getAttribute('aria-expanded') === 'true';
        hint.textContent = expanded ? t('drawer.close') : t('drawer.open');
      });
    }

    async function refresh(appState) {
      try {
        const response = await fetch('/status-feed', { cache: 'no-store' });
        runtime.feed = await response.json();
      } catch (error) {
        runtime.feed = runtime.feed || {
          current: {
            state: (appState && appState.currentState) || 'idle',
            detail: (appState && appState.currentDetail) || '',
            hero: heroNameForId(defaultHeroIdForState('idle')),
            source: 'frontend_fallback',
            event_type: 'unknown',
            request_id: null,
            sequence: 0,
            updated_at: null
          },
          history: [],
          watcher: {
            status: 'offline',
            protocolMode: null,
            lastObservedActivity: null,
            lastObservedToolName: null,
            lastBridgeCommand: null,
            heartbeatAt: null
          },
          memoSummary: {
            date: null,
            summary: t('memo.empty'),
            hasMemo: false
          }
        };
      }
      render(appState);
    }

    function render(appState) {
      const feed = runtime.feed || {
        current: {
          state: (appState && appState.currentState) || 'idle',
          detail: (appState && appState.currentDetail) || defaultDetail((appState && appState.currentState) || 'idle'),
          hero: heroNameForId(defaultHeroIdForState('idle')),
          source: 'frontend_fallback',
          event_type: 'unknown',
          request_id: null,
          sequence: 0,
          updated_at: null
        },
        history: [],
        watcher: {
          status: 'offline',
          protocolMode: null,
          lastObservedActivity: null,
          lastObservedToolName: null,
          lastBridgeCommand: null,
          heartbeatAt: null
        },
        memoSummary: {
          date: null,
          summary: t('memo.empty'),
          hasMemo: false
        }
      };

      const nextHeadline = deriveHeadline(appState, feed);
      const nextStage = deriveStageNarration(appState, feed);
      const nextFocus = deriveFocusLines(appState, feed);
      const nextMeta = deriveMeta(feed);
      const nextHistory = renderHistory(feed);
      updatePanelSummary(appState, feed);
      refreshPanelHints();
      const signature = JSON.stringify({
        headline: nextHeadline,
        stage: nextStage,
        focus: nextFocus,
        meta: nextMeta,
        history: nextHistory,
        controlSummary: ui.controlPanelSummary ? ui.controlPanelSummary.textContent : '',
        memoSummary: ui.memoPanelSummary ? ui.memoPanelSummary.textContent : ''
      });

      if (runtime.lastSignature === signature) return;
      runtime.lastSignature = signature;

      if (ui.statusHeadline) ui.statusHeadline.textContent = nextHeadline;
      if (ui.statusStage) ui.statusStage.textContent = nextStage;
      if (ui.statusFocus) ui.statusFocus.textContent = nextFocus;
      if (ui.statusMeta) ui.statusMeta.textContent = nextMeta;
      if (ui.statusHistory) ui.statusHistory.innerHTML = nextHistory;
    }

    function start(appState) {
      setupPanelToggle('control-panel', 'controlPanelToggle', 'controlPanelBody');
      setupPanelToggle('memo-panel', 'memoPanelToggle', 'memoPanelBody');
      render(appState);
      refresh(appState);
      runtime.renderTimerId = setInterval(function () { render(appState); }, 500);
      runtime.refreshTimerId = setInterval(function () { refresh(appState); }, 2500);
      const i18n = deps.i18n || window.BrotherhoodI18n;
      if (i18n && typeof i18n.subscribe === 'function') {
        i18n.subscribe(function () {
          runtime.lastSignature = '';
          render(appState);
        });
      }
    }

    return {
      start: start,
      render: render,
      refresh: refresh
    };
  }

  window.BrotherhoodNarrativeStatusRuntime = {
    createNarrativeStatusRuntime: createNarrativeStatusRuntime
  };
})();
