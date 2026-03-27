(function () {
  'use strict';

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function safeArray(value) { return Array.isArray(value) ? value : []; }

  function extractDialogueLines(node) {
    const lines = [];
    if (!node || typeof node !== 'object') return lines;
    if (Array.isArray(node.lines)) {
      for (const line of node.lines) {
        const text = String(line || '').trim();
        if (text) lines.push(text);
      }
    }
    const text = (node.text && String(node.text).trim()) ? String(node.text).trim() : '';
    if (!lines.length && text) lines.push(text);
    return lines;
  }

  function deriveDialogueTags(heroId, state, text) {
    const tags = new Set([String(heroId || 'unknown'), String(state || 'default')]);
    const value = String(text || '');
    if (/[刀拳打撞殺戰狠]/.test(value)) tags.add('forceful');
    if (/[靜穩等守忍]/.test(value)) tags.add('steady');
    if (/[局計章法後手棋]/.test(value)) tags.add('strategic');
    if (/[火亂急救壓鎮]/.test(value)) tags.add('urgent');
    if (/[聞查探看翻]/.test(value)) tags.add('probe');
    if (/[笑酒鍋味]/.test(value)) tags.add('sharp');
    if (/[堂上梁山兄弟]/.test(value)) tags.add('hall');
    if (tags.size <= 2) tags.add('watchful');
    return Array.from(tags);
  }

  function deriveDialogueWeight(text, tags) {
    let weight = 1;
    const value = String(text || '');
    if (/[！!？?]/.test(value)) weight += 0.6;
    if ((tags || []).includes('forceful') || (tags || []).includes('urgent')) weight += 0.4;
    if ((tags || []).includes('strategic') || (tags || []).includes('sharp')) weight += 0.25;
    if (value.length >= 22) weight += 0.15;
    return Math.max(0.2, Number(weight.toFixed(2)));
  }

  function extractDialogueEntries(node, meta) {
    const entries = [];
    if (!node || typeof node !== 'object') return entries;
    const defaultTags = Array.isArray(node.defaultTags)
      ? node.defaultTags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : [];
    const defaultWeight = Math.max(0.1, Number(node.defaultWeight || 1));

    const pushEntry = (rawEntry) => {
      if (!rawEntry) return;
      const isString = typeof rawEntry === 'string';
      const text = isString ? String(rawEntry || '').trim() : String(rawEntry.text || '').trim();
      if (!text) return;
      const explicitTags = !isString && Array.isArray(rawEntry.tags)
        ? rawEntry.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
        : [];
      const mergedTags = [
        ...defaultTags,
        ...explicitTags,
        ...deriveDialogueTags(meta && meta.heroId, meta && meta.state, text)
      ];
      const tags = Array.from(new Set(mergedTags.filter(Boolean)));
      const weight = !isString && rawEntry.weight != null
        ? Math.max(0.1, Number(rawEntry.weight))
        : deriveDialogueWeight(text, tags) * defaultWeight;
      entries.push({
        text: text,
        tags: tags,
        weight: Math.max(0.1, Number(weight))
      });
    };

    if (Array.isArray(node.lines)) node.lines.forEach(pushEntry);
    const text = (node.text && String(node.text).trim()) ? String(node.text).trim() : '';
    if (!entries.length && text) pushEntry(text);
    return entries;
  }

  function getDialogueSelectionConfig(themeConfig) {
    const root = (themeConfig && themeConfig.dialogueSelection && typeof themeConfig.dialogueSelection === 'object')
      ? themeConfig.dialogueSelection
      : {};
    return {
      sameLinePenalty: clamp(Number(root.sameLinePenalty || 0.08), 0.01, 1),
      sharedTagPenalty: clamp(Number(root.sharedTagPenalty || 0.45), 0.05, 1),
      recentTagMemory: Math.max(1, Number(root.recentTagMemory || 2))
    };
  }

  function getHandoffDialogueConfig(themeConfig, state) {
    const dialogues = themeConfig && themeConfig.handoffDialogues;
    if (!dialogues || typeof dialogues !== 'object') return null;
    const node = dialogues[state];
    if (!node || typeof node !== 'object') return null;
    const entries = extractDialogueEntries(node, { heroId: String(node.speaker || 'songjiang'), state: 'handoff_' + state });
    if (!entries.length) return null;
    const delayMs = Math.max(0, Number(node.delayMs || 0));
    return {
      speaker: String(node.speaker || 'songjiang'),
      entries: entries,
      delayMs: delayMs
    };
  }

  function getHeroDialogueNode(themeConfig, heroId, state) {
    const root = themeConfig && themeConfig.heroDialogues;
    if (!root || typeof root !== 'object' || !heroId || !state) return null;
    const heroNode = (root[heroId] && typeof root[heroId] === 'object') ? root[heroId] : null;
    if (!heroNode) return null;
    const node = heroNode[state];
    if (!node || typeof node !== 'object') return null;
    const entries = extractDialogueEntries(node, { heroId: heroId, state: state });
    if (!entries.length) return null;
    return { node, entries };
  }

  function getHeroDialogueLoopConfig(themeConfig, heroId, state) {
    const heroDialogue = getHeroDialogueNode(themeConfig, heroId, state);
    if (!heroDialogue) return null;
    const root = themeConfig && themeConfig.heroDialogues;
    const defaults = (root && root.defaultTiming && typeof root.defaultTiming === 'object')
      ? root.defaultTiming
      : {};
    const node = heroDialogue.node;
    return {
      entries: heroDialogue.entries,
      firstDelayMinMs: Math.max(0, Number(node.firstDelayMinMs || defaults.firstDelayMinMs || 2500)),
      firstDelayMaxMs: Math.max(0, Number(node.firstDelayMaxMs || node.firstDelayMinMs || defaults.firstDelayMaxMs || defaults.firstDelayMinMs || 4000)),
      intervalMinMs: Math.max(0, Number(node.intervalMinMs || defaults.intervalMinMs || 6000)),
      intervalMaxMs: Math.max(0, Number(node.intervalMaxMs || node.intervalMinMs || defaults.intervalMaxMs || defaults.intervalMinMs || 12000)),
      minGapAfterMainMs: Math.max(0, Number(node.minGapAfterMainMs || defaults.minGapAfterMainMs || 2500)),
      minGapAfterSupportMs: Math.max(0, Number(node.minGapAfterSupportMs || defaults.minGapAfterSupportMs || 2500))
    };
  }

  function getIdleRandomEventConfig(themeConfig) {
    const mainScene = themeConfig && themeConfig.mainScene;
    const node = mainScene && typeof mainScene === 'object' && mainScene.randomEvents && typeof mainScene.randomEvents === 'object'
      ? mainScene.randomEvents
      : null;
    if (!node || node.enabled === false) return null;
    const heroStyles = (node.heroStyles && typeof node.heroStyles === 'object') ? node.heroStyles : {};
    const heroDialogues = (themeConfig && themeConfig.heroDialogues && typeof themeConfig.heroDialogues === 'object')
      ? themeConfig.heroDialogues
      : {};
    const pool = [];
    Object.keys(heroDialogues).forEach((heroId) => {
      if (heroId === 'defaultTiming') return;
      const idleNode = getHeroDialogueNode(themeConfig, heroId, 'idle');
      if (!idleNode) return;
      const styleNode = (heroStyles[heroId] && typeof heroStyles[heroId] === 'object') ? heroStyles[heroId] : {};
      idleNode.entries.forEach((entry, index) => {
        pool.push({
          id: heroId + '_idle_' + String(index + 1).padStart(2, '0'),
          heroId: String(heroId),
          text: entry.text,
          tags: entry.tags,
          weight: Math.max(0.1, Number(entry.weight || 1)) * Math.max(1, Number(styleNode.weight || 1)),
          speakerStyle: String(styleNode.speakerStyle || 'default'),
          scaleBoost: Math.max(1, Number(styleNode.scaleBoost || 1.06)),
          tint: (styleNode.tint != null) ? Number(styleNode.tint) : 0xffe3a1,
          durationMs: Math.max(800, Number(styleNode.durationMs || 0)) || null
        });
      });
    });
    if (!pool.length) return null;
    const intervalMs = Array.isArray(node.intervalMs) ? node.intervalMs : [5000, 12000];
    return {
      intervalMinMs: Math.max(1000, Number(intervalMs[0] || 5000)),
      intervalMaxMs: Math.max(1000, Number(intervalMs[1] || intervalMs[0] || 12000)),
      bubbleDurationMs: Math.max(1200, Number(node.bubbleDurationMs || 3600)),
      highlightDurationMs: Math.max(1000, Number(node.highlightDurationMs || 3200)),
      cooldownPerHeroMs: Math.max(0, Number(node.cooldownPerHeroMs || 14000)),
      pool: pool
    };
  }

  function pickDialogueEntry(appState, key, entries) {
    const cfg = getDialogueSelectionConfig(appState.themeConfig);
    const lastLine = appState.lastDialogueLineByKey[key] || null;
    const recentTags = Array.isArray(appState.lastDialogueTagsByKey[key]) ? appState.lastDialogueTagsByKey[key] : [];
    if (entries.length === 1) {
      const only = entries[0];
      appState.lastDialogueLineByKey[key] = only.text;
      appState.lastDialogueTagsByKey[key] = safeArray(only.tags).slice(0, cfg.recentTagMemory);
      return only;
    }

    const weighted = entries.map((entry) => {
      let effectiveWeight = Math.max(0.1, Number(entry.weight || 1));
      if (entry.text === lastLine) effectiveWeight *= cfg.sameLinePenalty;
      if (recentTags.length && safeArray(entry.tags).some((tag) => recentTags.includes(tag))) {
        effectiveWeight *= cfg.sharedTagPenalty;
      }
      return {
        entry,
        effectiveWeight: Math.max(0.01, effectiveWeight)
      };
    });
    const total = weighted.reduce((sum, item) => sum + item.effectiveWeight, 0);
    let roll = Math.random() * total;
    let chosen = weighted[weighted.length - 1].entry;
    for (const item of weighted) {
      roll -= item.effectiveWeight;
      if (roll <= 0) {
        chosen = item.entry;
        break;
      }
    }
    appState.lastDialogueLineByKey[key] = chosen.text;
    appState.lastDialogueTagsByKey[key] = safeArray(chosen.tags).slice(0, cfg.recentTagMemory);
    return chosen;
  }

  function randBetween(min, max) {
    const a = Math.max(0, Number(min || 0));
    const b = Math.max(a, Number(max || a));
    if (a === b) return a;
    return Math.floor(a + Math.random() * (b - a));
  }

  function getAdaptiveBubbleDurationMs(text, options) {
    const opts = options || {};
    const value = String(text || '');
    const trimmed = value.trim();
    const normalized = trimmed.replace(/\s+/g, ' ');
    const baseMs = Math.max(0, Number(opts.baseMs || 3000));
    const perCharMs = Math.max(0, Number(opts.perCharMs || 115));
    const punctuationBonusMs = Math.max(0, Number(opts.punctuationBonusMs || 140));
    const lineBreakBonusMs = Math.max(0, Number(opts.lineBreakBonusMs || 320));
    const minMs = Math.max(0, Number(opts.minMs || 3200));
    const maxMs = Math.max(minMs, Number(opts.maxMs || 9000));
    const punctuationCount = (normalized.match(/[，。！？、；：,.!?;:]/g) || []).length;
    const lineBreakCount = (trimmed.match(/\n/g) || []).length;
    const effectiveLength = normalized.length;
    const durationMs = baseMs +
      (effectiveLength * perCharMs) +
      (punctuationCount * punctuationBonusMs) +
      (lineBreakCount * lineBreakBonusMs);
    return clamp(Math.round(durationMs), minMs, maxMs);
  }

  window.BrotherhoodDialogueRuntime = {
    extractDialogueLines,
    getDialogueSelectionConfig,
    getHandoffDialogueConfig,
    getHeroDialogueNode,
    getHeroDialogueLoopConfig,
    getIdleRandomEventConfig,
    getAdaptiveBubbleDurationMs,
    pickDialogueEntry,
    randBetween
  };
})();
