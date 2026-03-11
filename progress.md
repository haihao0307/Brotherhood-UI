Original prompt: 修复一个老板本遗留的问题：同步状态和出错状态在老版本没有supporthero时都是用宋江这一个角色，因此会有一些特效，比如宋江变蓝色或者红色并且伴随一定幅度的位移抖动。新版本的6个状态都分配了supporthero，因此没必要区别对待宋江，修复这个逻辑

- Investigating legacy state effects in `frontend/js/theme-engine.js`.
- Goal: keep legacy fallback behavior, but suppress main-hero tint/shake in configured scenes that use a dedicated support hero.
- Added `shouldApplyMainStateEffects()` in `frontend/js/theme-engine.js` so legacy main-hero effects only run when the current scene does not hand off to a support hero.
- Verified in browser with Playwright screenshots for `syncing` and `error`: Songjiang no longer gets the old tint/shake treatment in configured support-hero scenes.
- Tooling note: installed `playwright` plus Chromium into `C:\Users\TUF\.codex\skills\develop-web-game` to unblock screenshot-based regression checks.
- Fixed initial non-idle dialogue flow in `frontend/js/app.js`: first load into states like `researching` now shows the configured main dialogue instead of only the generic `[状态] 详情` bubble.
- Verified `researching` on initial page load with Playwright screenshot after pre-setting backend state to `researching`.
- Added a configurable main-hero dialogue loop in `frontend/js/app.js`, separate from the one-shot transition dialogue and separate from support-hero loops.
- Enabled the loop for `dialogues.researching` in `frontend/themes/liangshan/theme.json`.
- Verified one `researching` session with two screenshots: initial line and a later different follow-up line while Songjiang kept playing the researching animation.
