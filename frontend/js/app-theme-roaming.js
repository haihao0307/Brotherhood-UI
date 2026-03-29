(function () {
  'use strict';

  const helpers = window.StarOfficeThemeRuntime || {};
  const clamp = helpers.clamp || function (value, min, max) {
    return Math.max(min, Math.min(max, value));
  };
  const randFloat = helpers.randFloat || function (min, max) {
    const a = Number(min || 0);
    const b = Number(max || a);
    if (a === b) return a;
    return a + Math.random() * (b - a);
  };

  function applyRoamingAPI(ThemeEngine) {
    if (!ThemeEngine || !ThemeEngine.prototype) return;

    ThemeEngine.prototype.initSupportRoaming = function () {
      const cast = this.runtime.mainScene.cast || {};
      const config = this.runtime.mainScene.supportRoaming || {};
      const supportIds = Object.keys(this.runtime.supportHeroes).filter((heroId) => !!cast[heroId]).sort((a, b) => cast[a].x - cast[b].x);
      this.supportRoamingState = {};
      if (!supportIds.length) return;

      supportIds.forEach((heroId, index) => {
        const castNode = cast[heroId];
        const prevId = index > 0 ? supportIds[index - 1] : null;
        const nextId = index < supportIds.length - 1 ? supportIds[index + 1] : null;
        const prevNode = prevId ? cast[prevId] : null;
        const nextNode = nextId ? cast[nextId] : null;

        let left = prevNode
          ? Math.round(((prevNode.x + castNode.x) * 0.5) + config.innerPaddingPx)
          : Math.max(config.edgePaddingPx, castNode.x - 140);
        let right = nextNode
          ? Math.round(((castNode.x + nextNode.x) * 0.5) - config.innerPaddingPx)
          : Math.min(1280 - config.edgePaddingPx, castNode.x + 140);
        if ((right - left) < config.minLaneWidthPx) {
          const mid = castNode.x;
          left = Math.round(mid - (config.minLaneWidthPx * 0.5));
          right = Math.round(mid + (config.minLaneWidthPx * 0.5));
        }
        left = clamp(left, config.edgePaddingPx, 1280 - config.edgePaddingPx);
        right = clamp(right, config.edgePaddingPx, 1280 - config.edgePaddingPx);

        this.supportRoamingState[heroId] = {
          heroId: heroId,
          baseX: castNode.x,
          baseY: castNode.y,
          bounds: {
            left: Math.min(left, right),
            right: Math.max(left, right),
            top: castNode.y - config.yUpPx,
            bottom: castNode.y + config.yDownPx
          },
          target: null,
          pauseUntil: 0,
          nextDecisionAt: 0,
          speedPxPerSec: config.speedMinPxPerSec,
          lastMoveDir: 1
        };
      });
    };

    ThemeEngine.prototype.resetSupportRoaming = function (time) {
      const now = Number(time || 0);
      const config = this.runtime.mainScene.supportRoaming || {};
      Object.keys(this.supportRoamingState).forEach((heroId) => {
        const state = this.supportRoamingState[heroId];
        const actor = this.supportCast[heroId];
        state.target = null;
        state.pauseUntil = now + randFloat(config.startDelayMinMs, config.startDelayMaxMs);
        state.nextDecisionAt = state.pauseUntil;
        state.speedPxPerSec = randFloat(config.speedMinPxPerSec, config.speedMaxPxPerSec);
        state.lastMoveDir = 1;
        if (!actor) return;
        actor.setPosition(state.baseX, state.baseY);
        actor.setFlipX(false);
        this.playActorState(actor, this.runtime.supportHeroes[heroId], 'support', 'idle');
      });
    };

    ThemeEngine.prototype.setSupportRoamingEnabled = function (enabled, time) {
      const allow = !!enabled && !!(this.runtime.mainScene.supportRoaming && this.runtime.mainScene.supportRoaming.enabled);
      if (this.supportRoamingEnabled === allow) return;
      this.supportRoamingEnabled = allow;
      if (!allow) {
        Object.keys(this.supportRoamingState).forEach((heroId) => {
          const state = this.supportRoamingState[heroId];
          const actor = this.supportCast[heroId];
          state.target = null;
          state.pauseUntil = 0;
          state.nextDecisionAt = 0;
          if (!actor) return;
          actor.setFlipX(false);
          if (this.sceneMode === 'main_idle') {
            this.playActorState(actor, this.runtime.supportHeroes[heroId], 'support', 'idle');
          }
        });
        return;
      }
      this.resetSupportRoaming(time);
    };

    ThemeEngine.prototype.pickSupportRoamingTarget = function (heroId) {
      const config = this.runtime.mainScene.supportRoaming || {};
      const state = this.supportRoamingState[heroId];
      if (!state) return null;

      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 8; i += 1) {
        const candidate = {
          x: randFloat(state.bounds.left, state.bounds.right),
          y: randFloat(state.bounds.top, state.bounds.bottom)
        };
        let minDistance = Infinity;
        Object.keys(this.supportRoamingState).forEach((otherHeroId) => {
          if (otherHeroId === heroId) return;
          const otherState = this.supportRoamingState[otherHeroId];
          const otherActor = this.supportCast[otherHeroId];
          if (!otherState || !otherActor || !otherActor.visible) return;
          const otherTarget = otherState.target || { x: otherActor.x, y: otherActor.y };
          const dx = candidate.x - otherTarget.x;
          const dy = candidate.y - otherTarget.y;
          minDistance = Math.min(minDistance, Math.sqrt(dx * dx + dy * dy));
        });
        if (!isFinite(minDistance)) minDistance = config.minTargetSeparationPx + 24;
        const offsetX = Math.abs(candidate.x - state.baseX);
        const score = minDistance + Math.random() * 18 + offsetX * 0.15;
        if (minDistance >= config.minTargetSeparationPx) return candidate;
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      return best;
    };

    ThemeEngine.prototype.updateSupportRoaming = function (time, delta) {
      if (this.sceneMode !== 'main_idle' || !this.supportRoamingEnabled) return;
      const config = this.runtime.mainScene.supportRoaming || {};
      const deltaSeconds = Math.max(0, Number(delta || 0)) / 1000;

      Object.keys(this.supportRoamingState).forEach((heroId) => {
        const state = this.supportRoamingState[heroId];
        const actor = this.supportCast[heroId];
        const heroDef = this.runtime.supportHeroes[heroId];
        if (!state || !actor || !heroDef || !actor.visible) return;

        const emphasis = this.idleEventEmphasis[heroId];
        if (config.pauseDuringBubble && emphasis) {
          this.playActorState(actor, heroDef, 'support', 'idle');
          return;
        }

        if (!state.target) {
          if (time < state.nextDecisionAt || time < state.pauseUntil) {
            this.playActorState(actor, heroDef, 'support', 'idle');
            return;
          }
          const target = this.pickSupportRoamingTarget(heroId);
          if (!target) {
            state.nextDecisionAt = time + randFloat(config.pauseMinMs, config.pauseMaxMs);
            this.playActorState(actor, heroDef, 'support', 'idle');
            return;
          }
          state.target = target;
          state.speedPxPerSec = randFloat(config.speedMinPxPerSec, config.speedMaxPxPerSec);
        }

        const dx = state.target.x - actor.x;
        const dy = state.target.y - actor.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= config.reachThresholdPx) {
          actor.setPosition(state.target.x, state.target.y);
          state.target = null;
          state.pauseUntil = time + randFloat(config.pauseMinMs, config.pauseMaxMs);
          state.nextDecisionAt = state.pauseUntil;
          this.playActorState(actor, heroDef, 'support', 'idle');
          return;
        }

        const step = Math.max(1, state.speedPxPerSec * deltaSeconds);
        const ratio = clamp(step / distance, 0, 1);
        actor.setPosition(actor.x + dx * ratio, actor.y + dy * ratio);
        if (Math.abs(dx) > 1) {
          state.lastMoveDir = dx >= 0 ? 1 : -1;
          actor.setFlipX(state.lastMoveDir < 0);
        }
        this.playActorState(actor, heroDef, 'support', 'walking');
      });
    };
  }

  window.StarOfficeThemeRoaming = {
    applyRoamingAPI: applyRoamingAPI
  };
})();
