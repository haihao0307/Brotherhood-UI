(function () {
  'use strict';

  const STATES = [
    { key: 'idle', label: '待命', cls: 'primary' },
    { key: 'writing', label: '写作', cls: '' },
    { key: 'researching', label: '研究', cls: '' },
    { key: 'executing', label: '执行', cls: '' },
    { key: 'syncing', label: '同步', cls: '' },
    { key: 'error', label: '出错', cls: 'danger' }
  ];

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

    buttons.innerHTML = '';
    for (const s of STATES) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (s.cls || '');
      btn.textContent = s.label;
      btn.addEventListener('click', async () => {
        const detail = (detailInput.value || '').trim();
        try {
          await postJSON('/set_state', { state: s.key, detail });
          if (appApi && typeof appApi.fetchStatusNow === 'function') appApi.fetchStatusNow();
        } catch (e) {
          alert('请求失败：请确认后端已启动。');
        }
      });
      buttons.appendChild(btn);
    }
  }

  window.StarOfficePanels = window.StarOfficePanels || {};
  window.StarOfficePanels.initControlPanel = initControlPanel;
})();

