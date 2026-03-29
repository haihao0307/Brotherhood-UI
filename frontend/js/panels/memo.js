(function () {
  'use strict';

  function t(key, params, fallback) {
    const i18n = window.BrotherhoodI18n;
    if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
    return fallback != null ? fallback : key;
  }

  async function fetchMemo() {
    const r = await fetch('/yesterday-memo', { cache: 'no-store' });
    return await r.json();
  }

  function initMemoPanel() {
    const meta = document.getElementById('memoMeta');
    const text = document.getElementById('memoText');
    const err = document.getElementById('memoError');
    if (!meta || !text || !err) return;

    let lastPayload = null;

    function render(data, failed) {
      err.textContent = '';
      text.textContent = '';
      if (failed) {
        meta.textContent = t('memo.loadFailed');
        err.textContent = t('memo.loadFailedHint');
        return;
      }
      if (data && data.success) {
        meta.textContent = t('memo.date', { date: data.date || '-' });
        text.textContent = (data.memo || '').trim();
        return;
      }
      meta.textContent = t('memo.empty');
      err.textContent = t('memo.notFound');
    }

    async function refresh() {
      err.textContent = '';
      meta.textContent = t('memo.loading');
      text.textContent = '';
      try {
        const data = await fetchMemo();
        lastPayload = data;
        render(data, false);
      } catch (e) {
        lastPayload = { failed: true };
        render(lastPayload, true);
      }
    }

    refresh();
    setInterval(refresh, 60000);
    const i18n = window.BrotherhoodI18n;
    if (i18n && typeof i18n.subscribe === 'function') {
      i18n.subscribe(() => {
        if (!lastPayload) {
          meta.textContent = t('memo.loading');
          return;
        }
        render(lastPayload, !!lastPayload.failed);
      });
    }
  }

  window.StarOfficePanels = window.StarOfficePanels || {};
  window.StarOfficePanels.initMemoPanel = initMemoPanel;
})();
