(function () {
  'use strict';

  const AUDIO_STATES = ['idle', 'writing', 'researching', 'executing', 'syncing', 'error'];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function buildVersionedUrl(raw, version) {
    const mark = raw.includes('?') ? '&' : '?';
    return raw + mark + 'v=' + encodeURIComponent(version);
  }

  function createStateAudioManager(themeConfig, version) {
    const audioCfg = themeConfig && themeConfig.audio;
    const disabledStub = {
      hasAny: false,
      setEnabled: function () {},
      playForState: function () {},
      ensureForState: function () {},
      unlock: function () {},
      stop: function () {},
      setRole: function () {},
      getRole: function () { return null; }
    };

    if (!audioCfg || audioCfg.enabled === false) return disabledStub;

    const masterVolume = clamp(Number(audioCfg.volume || 0.55), 0, 1);
    const globalStates = (audioCfg.states && typeof audioCfg.states === 'object') ? audioCfg.states : {};
    const rolesCfg = (audioCfg.roles && typeof audioCfg.roles === 'object') ? audioCfg.roles : {};
    const mainHeroNode = (themeConfig && themeConfig.mainHero && typeof themeConfig.mainHero === 'object')
      ? themeConfig.mainHero
      : (themeConfig && themeConfig.hero && typeof themeConfig.hero === 'object' ? themeConfig.hero : null);
    const fallbackRole = (mainHeroNode && (mainHeroNode.role || mainHeroNode.id))
      ? String(mainHeroNode.role || mainHeroNode.id)
      : 'songjiang';
    let activeRole = String(audioCfg.role || fallbackRole || 'songjiang').trim();
    if (!activeRole) activeRole = 'songjiang';

    const cacheByRole = {};
    let enabled = true;
    let currentState = null;
    let currentRole = activeRole;
    let currentAudio = null;
    let pendingState = null;

    function getRoleNode(role) {
      const node = rolesCfg[role];
      return (node && typeof node === 'object') ? node : {};
    }

    function buildFromStateNode(node, pattern, role, state) {
      if (!node && !pattern) return null;
      const rawFile = (typeof node === 'string') ? node : (node && (node.mp3 || node.url));
      const file = rawFile || (pattern ? pattern.replace('{role}', role).replace('{state}', state) : null);
      if (!file) return null;

      const loop = !(node && node.loop === false);
      const stateVolume = (node && typeof node.volume === 'number') ? node.volume : 1.0;
      const volume = clamp(masterVolume * stateVolume, 0, 1);
      const audio = new Audio(buildVersionedUrl(String(file), version));
      audio.preload = 'auto';
      audio.loop = loop;
      audio.volume = volume;
      return { audio, loop, volume };
    }

    function ensureRoleEntries(role) {
      if (cacheByRole[role]) return cacheByRole[role];

      const roleNode = getRoleNode(role);
      const rolePattern = (roleNode && typeof roleNode.pattern === 'string') ? roleNode.pattern : null;
      const globalPattern = (typeof audioCfg.pattern === 'string') ? audioCfg.pattern : null;
      const pattern = rolePattern || globalPattern;
      const roleStates = (roleNode && roleNode.states && typeof roleNode.states === 'object') ? roleNode.states : {};
      const roleHasExplicitStates = Object.keys(roleStates).length > 0;
      const entries = {};

      for (const state of AUDIO_STATES) {
        const hasExplicitRoleState = state in roleStates;
        const node = hasExplicitRoleState
          ? roleStates[state]
          : (roleHasExplicitStates ? null : globalStates[state]);
        const entry = buildFromStateNode(
          node,
          hasExplicitRoleState || !roleHasExplicitStates ? pattern : null,
          role,
          state
        );
        if (!entry) continue;
        entries[state] = entry;
      }
      cacheByRole[role] = entries;
      return entries;
    }

    function stopCurrent() {
      if (!currentAudio) return;
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
      currentState = null;
      currentRole = activeRole;
    }

    function playState(state, restart) {
      if (!enabled) return;
      const entries = ensureRoleEntries(activeRole);
      const entry = entries[state];
      if (!entry) return;
      if (!restart && currentState === state && currentRole === activeRole && currentAudio && !currentAudio.paused) return;

      if (currentAudio && currentAudio !== entry.audio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      currentAudio = entry.audio;
      currentState = state;
      currentRole = activeRole;
      currentAudio.loop = entry.loop;
      currentAudio.volume = entry.volume;
      if (restart) currentAudio.currentTime = 0;

      const playPromise = currentAudio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          pendingState = state;
        });
      }
    }

    return {
      hasAny: Object.keys(ensureRoleEntries(activeRole)).length > 0,
      setEnabled: function (next) {
        enabled = !!next;
        if (!enabled) {
          if (currentAudio) currentAudio.pause();
          return;
        }
        if (pendingState) {
          const s = pendingState;
          pendingState = null;
          playState(s, true);
        } else if (currentState) {
          playState(currentState, false);
        }
      },
      playForState: function (state) { playState(state, true); },
      ensureForState: function (state) { playState(state, false); },
      stop: function () { stopCurrent(); },
      setRole: function (role) {
        const next = String(role || '').trim();
        if (!next || next === activeRole) return;
        activeRole = next;
        stopCurrent();
      },
      getRole: function () { return activeRole; },
      unlock: function () {
        if (!enabled || !pendingState) return;
        const s = pendingState;
        pendingState = null;
        playState(s, true);
      }
    };
  }

  window.BrotherhoodAudioRuntime = {
    createStateAudioManager
  };
})();
