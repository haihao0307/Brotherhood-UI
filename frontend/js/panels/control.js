(function () {
  'use strict';

  const STATES = [
    { key: 'idle', cls: 'primary' },
    { key: 'writing', cls: '' },
    { key: 'researching', cls: '' },
    { key: 'executing', cls: '' },
    { key: 'syncing', cls: '' },
    { key: 'error', cls: 'danger' }
  ];

  function t(key, params, fallback) {
    const i18n = window.BrotherhoodI18n;
    if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
    return fallback != null ? fallback : key;
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  function initControlPanel(appApi) {
    const panel = document.getElementById('control-panel');
    if (!panel) return;

    const detailInput = document.getElementById('detailInput');
    const buttons = document.getElementById('stateButtons');
    if (!detailInput || !buttons) return;

    function renderButtons() {
      buttons.innerHTML = '';
      for (const s of STATES) {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (s.cls || '');
        btn.textContent = t('state.labels.' + s.key);
        btn.addEventListener('click', async () => {
          const detail = (detailInput.value || '').trim();
          try {
            await postJSON('/set_state', { state: s.key, detail });
            if (appApi && typeof appApi.fetchStatusNow === 'function') appApi.fetchStatusNow();
          } catch (e) {
            alert(t('control.requestError'));
          }
        });
        buttons.appendChild(btn);
      }
    }

    renderButtons();
    const i18n = window.BrotherhoodI18n;
    if (i18n && typeof i18n.subscribe === 'function') {
      i18n.subscribe(renderButtons);
    }
  }

  window.StarOfficePanels = window.StarOfficePanels || {};
  window.StarOfficePanels.initControlPanel = initControlPanel;
})();
