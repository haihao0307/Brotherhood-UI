(function () {
  'use strict';

  const STORAGE_KEY = 'brotherhood_ui_locale';
  const SUPPORTED = ['zh-Hant', 'en'];
  const listeners = new Set();

  const DICTIONARY = {
    'zh-Hant': {
      chrome: {
        coords: {
          buttonOn: '座標: ON',
          buttonOff: '座標: OFF',
          title: '顯示滑鼠座標／點擊畫布複製',
          copied: '已複製座標',
          unknown: 'x: -, y: -'
        },
        audio: {
          buttonOn: '音效: ON',
          buttonOff: '音效: OFF',
          buttonNA: '音效: N/A',
          title: '狀態音效開關'
        },
        hint: '提示: 開啟座標後，點擊畫布複製座標',
        localeLabel: '語言',
        localeTraditional: '繁中',
        localeEnglish: 'EN',
        toolsOpen: '工具',
        toolsClose: '收起工具',
        toolsHeading: '次要工具',
        toolsSubheading: '控制面板與昨日小記收在這裡，不佔主舞台高度。'
      },
      loading: {
        title: '載入 Brotherhood-UI 主題中...',
        sub: '如果你第一次打開看到資源 404：請把你的素材放到 <code>frontend/themes/liangshan/</code>，然後重新整理。',
        failed: 'Brotherhood-UI 主題載入失敗。',
        errorPrefix: '錯誤: '
      },
      state: {
        kicker: 'OPENCLAW 狀態帶',
        focusLabel: '任務焦點',
        historyLabel: '最近過程',
        footerLabel: '即時回聲',
        labels: {
          idle: '待命',
          writing: '寫作',
          researching: '研究',
          executing: '執行',
          syncing: '同步',
          error: '出錯'
        },
        defaults: {
          idle: '待命中',
          writing: '在寫作中',
          researching: '在研究中',
          executing: '在執行中',
          syncing: '同步中',
          error: '出錯了，排查中'
        },
        historyTypes: {
          start: '起令',
          phase: '推進',
          done: '收束',
          fail: '失手',
          auto_idle: '回主場',
          api_set: '面板設定',
          route_apply: '路由',
          manual_set: '手動設定'
        },
        historyEmpty: '尚無過程記錄',
        historyEntered: '進入「{state}」階段',
        historyCurrent: '當前請求',
        metaLine: '來源: {source} · 更新時間: {time}{watcherMode}{bridge}',
        watcherMode: ' · 協議: {mode}',
        recentBridge: ' · 最近橋接: {command}',
        offlineLine: '[離線] 無法拉取狀態，請檢查 backend 是否已啟動 (http://127.0.0.1:18791)'
      },
      narrative: {
        headline: {
          handoff: '宋江正在交棒，準備讓{hero}接下這一程',
          error: '{hero}已頂到前台，正在鎮場救火',
          writing: '{hero}已接令落筆，正文正在鋪開',
          researching: '{hero}已潛入細處，正在翻查真章',
          executing: '{hero}已衝到台前，正在把事情打穿',
          syncing: '{hero}已接場調度，正在把前後重新鎖齊',
          idleHighlight: '{hero}在堂前插了一句，提醒你留神這一拍',
          idle: '宋江仍壓堂前，梁山暫作待命'
        },
        stage: {
          handoff: '舞台仍在主場景，宋江正在堂前發令，準備把這一步交給{hero}。',
          error: '{hero}已經接場，當前屬於救火與鎮場段落，上屏應以壓險穩局為主。',
          child: '子場景已經啟用，當前由{hero}在前台處理「{state}」段落。',
          idleHighlight: '主場景仍在運轉，{hero}正在堂前穿插一句閒時觀察，與上屏的即時演出互相照應。',
          idle: '主場景保持待命，宋江壓堂，其餘人可能巡遊、插話或短暫亮相。',
          default: '舞台停留在主場景，宋江暫壓堂前，等待下一道差遣。'
        },
        focus: {
          currentTask: '當前任務：{detail}',
          handoff: '階段提示：宋江仍在主場景交棒，這一拍將轉交給{hero}。',
          activeWorker: '當前在場：{hero}正在負責「{state}」環節。',
          idleHighlight: '閒時播報：{hero}正在給出場邊觀察。',
          idle: '閒時播報：堂前暫穩，主場景保持輕微流動。',
          default: '舞台態勢：主場景穩定，隨時準備切入下一段演出。',
          watcherActive: 'OpenClaw 觀察：{activity}',
          watcherOnline: 'OpenClaw 觀察：同步鏈路在線，等待新的動作信號。',
          watcherOffline: 'OpenClaw 觀察：同步觀察未連上，當前以本地狀態機資訊為準。'
        }
      },
      control: {
        title: '控制面板',
        summary: '當前：{state} · {detailState}',
        summaryHasDetail: '已填補充文案',
        summaryNoDetail: '無補充文案',
        detailLabel: '文案',
        detailPlaceholder: '例如：正在寫文案...',
        hint: '點擊按鈕會呼叫後端 /set_state，頁面會自動更新。',
        requestError: '請求失敗：請確認後端已啟動。'
      },
      memo: {
        title: '昨日小記',
        loading: '載入中...',
        date: '日期: {date}',
        empty: '暫無昨日小記',
        notFound: '沒有找到昨日日記',
        loadFailed: '昨日小記載入失敗',
        loadFailedHint: '請確認後端已啟動，且存在 memory/YYYY-MM-DD.md（在倉庫上級目錄）。',
        summary: '{date} · {summary}',
        loadedFallback: '已載入昨日小記'
      },
      drawer: {
        open: '點擊展開',
        close: '點擊收起'
      },
      hero: {
        songjiang: '宋江',
        wuyong: '吳用',
        sunerniang: '孫二娘',
        wusong: '武松',
        linchong: '林沖',
        luzhishen: '魯智深'
      }
    },
    en: {
      chrome: {
        coords: {
          buttonOn: 'Coords: ON',
          buttonOff: 'Coords: OFF',
          title: 'Show mouse coordinates / click the stage to copy',
          copied: 'Coordinates copied',
          unknown: 'x: -, y: -'
        },
        audio: {
          buttonOn: 'Audio: ON',
          buttonOff: 'Audio: OFF',
          buttonNA: 'Audio: N/A',
          title: 'State audio toggle'
        },
        hint: 'Hint: turn coordinates on, then click the stage to copy a point.',
        localeLabel: 'Language',
        localeTraditional: '繁中',
        localeEnglish: 'EN',
        toolsOpen: 'Tools',
        toolsClose: 'Hide Tools',
        toolsHeading: 'Secondary Tools',
        toolsSubheading: 'Control panel and yesterday memo live here so the main stage stays compact.'
      },
      loading: {
        title: 'Loading the Brotherhood-UI theme...',
        sub: 'If you see a 404 on first launch, place your assets in <code>frontend/themes/liangshan/</code> and refresh.',
        failed: 'Brotherhood-UI theme failed to load.',
        errorPrefix: 'Error: '
      },
      state: {
        kicker: 'OPENCLAW STATUS STRIP',
        focusLabel: 'Current Focus',
        historyLabel: 'Recent Steps',
        footerLabel: 'Live Readout',
        labels: {
          idle: 'Idle',
          writing: 'Writing',
          researching: 'Research',
          executing: 'Executing',
          syncing: 'Syncing',
          error: 'Error'
        },
        defaults: {
          idle: 'Standing by',
          writing: 'Writing in progress',
          researching: 'Research in progress',
          executing: 'Execution in progress',
          syncing: 'Sync in progress',
          error: 'Issue detected, investigating'
        },
        historyTypes: {
          start: 'Start',
          phase: 'Phase',
          done: 'Done',
          fail: 'Fail',
          auto_idle: 'Auto Idle',
          api_set: 'Panel Set',
          route_apply: 'Route',
          manual_set: 'Manual Set'
        },
        historyEmpty: 'No recent steps yet',
        historyEntered: 'Entered the "{state}" phase',
        historyCurrent: 'Current request',
        metaLine: 'Source: {source} · Updated: {time}{watcherMode}{bridge}',
        watcherMode: ' · Protocol: {mode}',
        recentBridge: ' · Recent bridge: {command}',
        offlineLine: '[Offline] Unable to fetch status. Check whether backend is running (http://127.0.0.1:18791)'
      },
      narrative: {
        headline: {
          handoff: 'Song Jiang is handing the scene over to {hero}',
          error: '{hero} has stepped forward to stabilize the scene',
          writing: '{hero} has taken the brush and begun drafting',
          researching: '{hero} has moved into the details and is digging deeper',
          executing: '{hero} is at the front line and pushing the task through',
          syncing: '{hero} is tightening the flow and reconnecting the chain',
          idleHighlight: '{hero} cut in with a stage-side observation',
          idle: 'Song Jiang still holds the hall while the stage waits'
        },
        stage: {
          handoff: 'The main hall is still active. Song Jiang is issuing the order and preparing to pass this step to {hero}.',
          error: '{hero} now anchors the stage. This beat is about triage, pressure control, and recovery.',
          child: 'A child scene is active. {hero} is currently handling the "{state}" segment on stage.',
          idleHighlight: 'The main hall is still running. {hero} is slipping in an idle observation that echoes the stage animation above.',
          idle: 'The main hall remains on standby under Song Jiang, while the rest of the cast may roam or interject.',
          default: 'The stage remains in the main hall with Song Jiang holding position for the next order.'
        },
        focus: {
          currentTask: 'Current task: {detail}',
          handoff: 'Stage cue: Song Jiang is still in the main hall, and this beat is about to pass to {hero}.',
          activeWorker: 'On stage now: {hero} is responsible for the "{state}" segment.',
          idleHighlight: 'Idle report: {hero} is offering an observation from the side.',
          idle: 'Idle report: the hall is calm and the main stage is gently in motion.',
          default: 'Stage posture: the main hall is stable and ready to pivot into the next act.',
          watcherActive: 'OpenClaw watch: {activity}',
          watcherOnline: 'OpenClaw watch: the sync loop is online and waiting for the next signal.',
          watcherOffline: 'OpenClaw watch: no live watcher signal is available, so the local state machine is the source of truth.'
        }
      },
      control: {
        title: 'Control Panel',
        summary: 'Current: {state} · {detailState}',
        summaryHasDetail: 'custom detail set',
        summaryNoDetail: 'no custom detail',
        detailLabel: 'Detail',
        detailPlaceholder: 'Example: drafting copy...',
        hint: 'Click a button to call /set_state. The page refreshes itself afterward.',
        requestError: 'Request failed. Please confirm the backend is running.'
      },
      memo: {
        title: 'Yesterday Memo',
        loading: 'Loading...',
        date: 'Date: {date}',
        empty: 'No yesterday memo',
        notFound: 'No memo file from yesterday was found',
        loadFailed: 'Failed to load yesterday memo',
        loadFailedHint: 'Please confirm the backend is running and that memory/YYYY-MM-DD.md exists one level above the repo.',
        summary: '{date} · {summary}',
        loadedFallback: 'memo loaded'
      },
      drawer: {
        open: 'Click to expand',
        close: 'Click to collapse'
      },
      hero: {
        songjiang: 'Song Jiang',
        wuyong: 'Wu Yong',
        sunerniang: 'Sun Erniang',
        wusong: 'Wu Song',
        linchong: 'Lin Chong',
        luzhishen: 'Lu Zhishen'
      }
    }
  };

  function readPath(root, key) {
    return String(key || '').split('.').reduce(function (node, part) {
      return node && typeof node === 'object' ? node[part] : undefined;
    }, root);
  }

  function format(template, params) {
    return String(template || '').replace(/\{(\w+)\}/g, function (_, key) {
      return params && params[key] != null ? String(params[key]) : '';
    });
  }

  function detectInitialLocale() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.indexOf(stored) >= 0) return stored;
    return 'zh-Hant';
  }

  let currentLocale = detectInitialLocale();

  function t(key, params) {
    const currentDict = DICTIONARY[currentLocale] || DICTIONARY['zh-Hant'];
    const fallbackDict = DICTIONARY['zh-Hant'];
    const value = readPath(currentDict, key);
    const fallback = readPath(fallbackDict, key);
    const resolved = value != null ? value : (fallback != null ? fallback : key);
    return typeof resolved === 'string' ? format(resolved, params) : resolved;
  }

  function applyDom(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (node) {
      node.innerHTML = t(node.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(function (node) {
      node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria-label')));
    });
    document.documentElement.lang = currentLocale === 'en' ? 'en' : 'zh-Hant';
    document.documentElement.setAttribute('data-ui-locale', currentLocale);
    if (document.body) document.body.setAttribute('data-ui-locale', currentLocale);
    document.querySelectorAll('[data-locale]').forEach(function (node) {
      const active = node.getAttribute('data-locale') === currentLocale;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function notify() {
    applyDom(document);
    listeners.forEach(function (listener) {
      try {
        listener(currentLocale);
      } catch (error) {
        console.warn('[Brotherhood-UI] locale listener failed:', error);
      }
    });
  }

  function setLocale(locale) {
    const nextLocale = SUPPORTED.indexOf(locale) >= 0 ? locale : 'zh-Hant';
    if (nextLocale === currentLocale) {
      applyDom(document);
      return currentLocale;
    }
    currentLocale = nextLocale;
    localStorage.setItem(STORAGE_KEY, currentLocale);
    notify();
    return currentLocale;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.add(listener);
    return function () {
      listeners.delete(listener);
    };
  }

  function init(doc) {
    const root = doc || document;
    root.querySelectorAll('[data-locale]').forEach(function (node) {
      if (node.__brotherhoodLocaleBound) return;
      node.__brotherhoodLocaleBound = true;
      node.addEventListener('click', function () {
        setLocale(node.getAttribute('data-locale'));
      });
    });
    applyDom(root);
  }

  window.BrotherhoodI18n = {
    init: init,
    t: t,
    getLocale: function () { return currentLocale; },
    setLocale: setLocale,
    subscribe: subscribe,
    applyDom: applyDom
  };
})();
