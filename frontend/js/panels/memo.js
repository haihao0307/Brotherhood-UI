(function () {
  'use strict';

  async function fetchMemo() {
    const r = await fetch('/yesterday-memo', { cache: 'no-store' });
    return await r.json();
  }

  function initMemoPanel() {
    const meta = document.getElementById('memoMeta');
    const text = document.getElementById('memoText');
    const err = document.getElementById('memoError');
    if (!meta || !text || !err) return;

    async function refresh() {
      err.textContent = '';
      meta.textContent = '加载中...';
      text.textContent = '';
      try {
        const data = await fetchMemo();
        if (data && data.success) {
          meta.textContent = '日期: ' + (data.date || '-');
          text.textContent = (data.memo || '').trim();
        } else {
          meta.textContent = '暂无昨日小记';
          err.textContent = (data && data.msg) ? String(data.msg) : '没有找到昨日日记';
        }
      } catch (e) {
        meta.textContent = '昨日小记加载失败';
        err.textContent = '请确认后端已启动，且存在 memory/YYYY-MM-DD.md（在仓库上级目录）。';
      }
    }

    refresh();
    setInterval(refresh, 60000);
  }

  window.StarOfficePanels = window.StarOfficePanels || {};
  window.StarOfficePanels.initMemoPanel = initMemoPanel;
})();

