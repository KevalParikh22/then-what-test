/* Then What?! — game rules engine (pure).
   Contract: DRD v1.1 §2.4 and docs/architecture/2026-10-23-phase-3-build-plan.md §3.2.
   Notes on choices made inside the contract: docs/architecture/2026-10-23-engine-notes.md.

   Rules for this file:
   - No DOM, no timers, no storage, no audio, no Math.random. Randomness comes from the
     injected rng (a function returning a number in [0, 1)).
   - Never mutates its inputs. Every change returns a new object (copy on write).
   - Never throws on a bad action. An invalid action returns the SAME state object.
   - State is plain JSON (it is saved as the draft).
*/
window.ThenWhat = window.ThenWhat || {};
ThenWhat.engine = (function () {
  'use strict';

  var STATE_VERSION = 1;

  var ACTIONS = {
    START: 'START',
    TICK: 'TICK',
    READY: 'READY',
    RECORD_STARTED: 'RECORD_STARTED',
    RECORD_STOPPED: 'RECORD_STOPPED',
    RECORD_SAVED: 'RECORD_SAVED',
    RECORD_FAILED: 'RECORD_FAILED',
    CONTINUE_UNRECORDED: 'CONTINUE_UNRECORDED',
    REPLACE_PROMPT: 'REPLACE_PROMPT',
    PASS: 'PASS',
    PAUSE: 'PAUSE',
    RESUME: 'RESUME',
    CONTINUE_AFTER_BREAK: 'CONTINUE_AFTER_BREAK',
    SOFTEN_TWIST: 'SOFTEN_TWIST',
    CHOOSE_FATE: 'CHOOSE_FATE',
    RESTART: 'RESTART',
    ABANDON: 'ABANDON'
  };

  var PHASES = {
    SETUP: 'SETUP',
    RELAY_TURN: 'RELAY_TURN',
    ROUND_BREAK: 'ROUND_BREAK',
    FATE_CHOICE: 'FATE_CHOICE',
    EPILOGUE: 'EPILOGUE'
  };

  var TURN = {
    HANDOVER: 'TURN_HANDOVER',
    READY: 'TURN_READY',
    RECORDING: 'TURN_RECORDING',
    SAVING: 'TURN_SAVING',
    DONE: 'TURN_DONE',     // transient: the engine moves straight on to the next turn
    PASSED: 'TURN_PASSED'  // transient: same
  };

  var BREAK = { TWIST_REVEAL: 'TWIST_REVEAL', NEXT_ROUND: 'NEXT_ROUND' };

  var FAIL_REASONS = ['unavailable', 'denied', 'disconnected', 'unsupported', 'quota', 'cancelled'];
  var FATE_ORDER = ['solved', 'changed', 'to-be-continued'];
  var LEVEL_DEFAULTS = {
    sprout: { maxRounds: 4, turnSeconds: 30, twistWindows: [2, 3], minTwists: 1, maxTwists: 1 },
    weaver: { maxRounds: 5, turnSeconds: 45, twistWindows: [2, 3, 4], minTwists: 1, maxTwists: 2 }
  };
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 6;
  var NICKNAME_MAX = 12;
  var PROMPT_NO_REPEAT = 4;

  // ---------------------------------------------------------------- helpers

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  // update(state, changes...) -> a new object; later change objects win.
  var objectAssign = assign;
  function update(state) {
    var out = objectAssign({}, state);
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) objectAssign(out, arguments[i]);
    return out;
  }

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function arr(x) { return Array.isArray(x) ? x : []; }

  // Wrap the injected rng so a bad value can never break the rules or throw.
  function safeRng(rng) {
    return function () {
      var x = 0;
      if (typeof rng === 'function') {
        try { x = Number(rng()); } catch (e) { x = 0; }
      }
      if (!(x >= 0 && x < 1)) x = 0;
      return x;
    };
  }

  function pick(list, r) {
    if (!list.length) return undefined;
    var i = Math.floor(r() * list.length);
    if (i >= list.length) i = list.length - 1;
    return list[i];
  }

  function findById(list, id) {
    list = arr(list);
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function otherLevel(level) { return level === 'weaver' ? 'sprout' : 'weaver'; }

  // Level-specific text with the DRD §3.1 fallback to the other level's text.
  function levelText(obj, level) {
    if (!obj) return '';
    return obj[level] || obj[otherLevel(level)] || obj.text || '';
  }

  /* Level rules: content.levels[level] where present, else the DRD §2.3 values.
     `override` (optional) is a rules object already saved in a state. */
  function levelDef(content, level, override) {
    var def = override || (content && content.levels && content.levels[level]) || {};
    var d = LEVEL_DEFAULTS[level] || LEVEL_DEFAULTS.sprout;
    var windows = Array.isArray(def.twistWindows) && def.twistWindows.length
      ? def.twistWindows.filter(function (w) { return typeof w === 'number'; }) : d.twistWindows;
    return {
      maxRounds: def.maxRounds > 0 ? def.maxRounds : d.maxRounds,
      turnSeconds: def.turnSeconds > 0 ? def.turnSeconds : d.turnSeconds,
      twistWindows: windows.slice(),
      minTwists: def.minTwists >= 0 ? def.minTwists : d.minTwists,
      maxTwists: def.maxTwists >= 0 ? def.maxTwists : d.maxTwists
    };
  }

  function charLength(s) { return Array.from(s).length; }

  function fillTemplate(tpl, items) {
    return String(tpl).replace(/\{(\w+)\.(\w+)\}/g, function (m, list, field) {
      var item = items[list];
      return item && item[field] != null ? String(item[field]) : '';
    });
  }

  // ---------------------------------------------------------------- worlds

  var BUILD_LISTS = ['where', 'when', 'kind', 'mission'];

  /* buildWorld({where, when, kind, mission}, content) -> world | null
     Choices are builder item ids. Returns a world object shaped like a ready-made world
     (kind "built") that points to the any-world Twists, Soften Twists, Fates and sparks.
     `levels` lists the levels the build is allowed at (Spooky House -> ["weaver"]). */
  function buildWorld(choices, content) {
    if (!isObj(choices) || !content || !isObj(content.builder)) return null;
    var b = content.builder;
    var items = {};
    var levels = ['sprout', 'weaver'];
    for (var i = 0; i < BUILD_LISTS.length; i++) {
      var list = BUILD_LISTS[i];
      var item = findById(b[list], choices[list]);
      if (!item) return null;
      items[list] = item;
      if (Array.isArray(item.levels)) {
        levels = levels.filter(function (l) { return item.levels.indexOf(l) >= 0; });
      }
    }
    var any = content.anyWorld || {};
    return {
      id: 'built-' + choices.where + '-' + choices.when + '-' + choices.kind + '-' + choices.mission,
      kind: 'built',
      title: fillTemplate(b.worldTitleTemplate || '{where.label} · {when.label}', items),
      world: fillTemplate(b.worldTemplate || '{where.phrase} {when.phrase}. {kind.phrase}', items),
      questTitle: fillTemplate(b.questTitleTemplate || '{mission.questTitle}', items),
      questGoal: items.mission.questGoal || '',
      quest: fillTemplate(b.questTemplate || '{mission.questText}', items),
      icon: items.where.icon || '',
      worldType: null,
      choices: { where: choices.where, when: choices.when, kind: choices.kind, mission: choices.mission },
      levels: levels,
      twists: arr(any.twists),
      softenTwists: arr(any.softenTwists),
      fates: arr(any.fates),
      sparks: arr(any.sparks)
    };
  }

  // The active world of a session, ready-made or rebuilt from the saved choices.
  function worldOf(state, content) {
    if (!state || !content) return null;
    if (state.builtWorld) return buildWorld(state.builtWorld, content);
    return findById(content.worlds, state.worldId);
  }

  function worldTwists(world) { return arr(world && world.twists); }

  function worldFates(world) {
    var fates = arr(world && world.fates).slice();
    fates.sort(function (a, b) { return FATE_ORDER.indexOf(a.type) - FATE_ORDER.indexOf(b.type); });
    return fates;
  }

  function softenById(world, id) {
    if (!world) return null;
    if (world.kind === 'built') return findById(world.softenTwists, id);
    return world.softenTwist && world.softenTwist.id === id ? world.softenTwist : null;
  }

  // ---------------------------------------------------------------- config

  /* validateConfig(config, content) -> {ok, errors[], normalized}
     Guards from DRD §2.2. Error codes: "pick-world", "bad-world", "level", "player-count",
     "nickname-too-long", "not-enough-characters", "world-level" (e.g. Spooky House at Sprout). */
  function validateConfig(config, content) {
    var errors = [];
    if (!isObj(config)) return { ok: false, errors: ['pick-world', 'player-count'], normalized: null };
    var level = config.level;
    if (!(content && content.levels && content.levels[level]) && !LEVEL_DEFAULTS[level]) errors.push('level');

    var worldId = null;
    var built = null;
    if (config.builtWorld) {
      var w = buildWorld(config.builtWorld, content);
      if (!w) errors.push('bad-world');
      else {
        if (w.levels.indexOf(level) < 0) errors.push('world-level');
        built = w.choices;
      }
    } else if (config.worldId != null && config.worldId !== '') {
      if (!findById(content && content.worlds, config.worldId)) errors.push('bad-world');
      else worldId = config.worldId;
    } else {
      errors.push('pick-world');
    }

    var n = config.playerCount;
    if (typeof n !== 'number' || Math.floor(n) !== n || n < MIN_PLAYERS || n > MAX_PLAYERS) {
      errors.push('player-count');
    }
    var useCharacters = config.useCharacters !== false; // on by default (DRD §2.2)

    var nicknames = [];
    var rawNames = arr(config.nicknames);
    var count = errors.indexOf('player-count') >= 0 ? 0 : n;
    for (var i = 0; i < count; i++) {
      var raw = rawNames[i];
      var name = typeof raw === 'string' ? raw.trim() : '';
      if (charLength(name) > NICKNAME_MAX) { errors.push('nickname-too-long'); name = ''; }
      nicknames.push(name || null);
    }

    if (useCharacters && count && arr(content && content.characters).length < count) {
      errors.push('not-enough-characters');
    }

    // Unique codes, stable order.
    errors = errors.filter(function (e, idx) { return errors.indexOf(e) === idx; });
    if (errors.length) return { ok: false, errors: errors, normalized: null };
    return {
      ok: true,
      errors: [],
      normalized: {
        level: level,
        worldId: worldId,
        builtWorld: built,
        playerCount: n,
        useCharacters: useCharacters,
        nicknames: nicknames,
        sessionId: typeof config.sessionId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(config.sessionId)
          ? config.sessionId : null
      }
    };
  }

  // ---------------------------------------------------------------- prompts (DRD §5.1)

  function promptPool(content, level) {
    return arr(content && content.prompts).filter(function (p) {
      return p && (p.level === level || p.level === 'all');
    });
  }

  /* Where the story is (decision 2026-10-29): 'final' = the last turn of the game,
     'twist' = first turn after a Twist, else 'begin' (round 1), 'end' (last round), 'middle'. */
  function storyStage(state) {
    if (state.round >= state.maxRounds && state.playerIndex === state.playerCount - 1) return 'final';
    if (state.pinnedTwist && state.pinnedTwist.round === state.round - 1 && state.playerIndex === 0) return 'twist';
    if (state.round <= 1) return 'begin';
    return state.round >= state.maxRounds ? 'end' : 'middle';
  }

  var QUEST_SLOT = '{quest}';
  function fillPrompt(text, world) {
    return String(text).split(QUEST_SLOT).join((world && world.questGoal) || '');
  }

  /* The level's prompts for this point in the story. Untagged prompts fit every stage.
     Prompts that name the quest need a world with questGoal. Falls back to the whole
     level pool when no prompt is tagged for the stage. */
  function stagePool(content, state) {
    var world = worldOf(state, content);
    var level = promptPool(content, state.level).filter(function (p) {
      return String(p.text).indexOf(QUEST_SLOT) < 0 || !!(world && world.questGoal);
    });
    var stage = storyStage(state);
    var fit = level.filter(function (p) { return !Array.isArray(p.stages) || p.stages.indexOf(stage) >= 0; });
    return fit.length ? fit : level;
  }

  function lastN(list, n) { return n > 0 ? list.slice(Math.max(0, list.length - n)) : []; }

  /* Draw a prompt id. `excludeCount` = how many of the most recent shown ids to avoid.
     Falls back to avoiding only the last shown prompt, then to the whole pool. */
  function drawPromptId(content, state, excludeCount, r) {
    var pool = stagePool(content, state);
    var history = state.promptHistory;
    // Prefer prompts not shown yet this game (decision 2026-10-29), then the last-N rule.
    var cands = pool.filter(function (p) { return history.indexOf(p.id) < 0; });
    if (!cands.length) {
      var ex = lastN(history, excludeCount);
      cands = pool.filter(function (p) { return ex.indexOf(p.id) < 0; });
    }
    if (!cands.length) {
      var last = lastN(history, 1);
      cands = pool.filter(function (p) { return last.indexOf(p.id) < 0; });
    }
    if (!cands.length) cands = pool;
    var p = pick(cands, r);
    return p ? p.id : null;
  }

  // ---------------------------------------------------------------- Twists (DRD §5.2)

  /* Chance of a Twist at the end of `round`, given how many Twists the story has had.
     Rounds, windows and limits come from the level definition (content.levels, saved into
     the state at START); the 0.50 chance and the "guaranteed by the end of round 3" rule
     are engine rules (DRD §5.2). Never outside a window, never at the end of the last round.
     `rules` = {maxRounds, twistWindows, minTwists, maxTwists}, or a level id string. */
  var GUARANTEE_ROUND = 3;
  var TWIST_CHANCE = 0.5;
  function twistChance(rules, round, count, content) {
    var r = typeof rules === 'string' ? levelDef(content, rules) : levelDef(null, 'sprout', rules);
    if (round >= r.maxRounds || r.twistWindows.indexOf(round) < 0 || count >= r.maxTwists) return 0;
    var lastWindow = r.twistWindows.filter(function (w) { return w < r.maxRounds; })
      .reduce(function (a, b) { return Math.max(a, b); }, 0);
    if (count < r.minTwists && (round === GUARANTEE_ROUND || round === lastWindow)) return 1;
    return TWIST_CHANCE;
  }

  // ---------------------------------------------------------------- session

  function makeSessionId(r) {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var s = 's-';
    for (var i = 0; i < 16; i++) s += chars.charAt(Math.floor(r() * chars.length) % chars.length);
    return s;
  }

  function shuffled(list, r) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      if (j > i) j = i;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function setupState(prev, setup) {
    return {
      v: STATE_VERSION,
      phase: PHASES.SETUP,
      // In SETUP, status/sessionId describe the session that just ended (null if none).
      status: prev ? prev.status : null,
      sessionId: prev ? prev.sessionId : null,
      setup: setup || { level: 'sprout', playerCount: 3, useCharacters: true, nicknames: [] }
    };
  }

  function setupFrom(state) {
    return {
      level: state.level,
      playerCount: state.playerCount,
      useCharacters: state.useCharacters,
      nicknames: arr(state.nicknames).slice()
    };
  }

  function startSession(norm, content, r, contentVersion) {
    var def = levelDef(content, norm.level);
    var characterIds = [];
    for (var i = 0; i < norm.playerCount; i++) characterIds.push(null);
    if (norm.useCharacters) {
      characterIds = shuffled(arr(content.characters), r).slice(0, norm.playerCount)
        .map(function (c) { return c.id; });
    }
    var sparkIndex = null;
    if (norm.builtWorld) {
      var sparks = arr(content.anyWorld && content.anyWorld.sparks);
      sparkIndex = sparks.length ? Math.min(sparks.length - 1, Math.floor(r() * sparks.length)) : null;
    }
    var sessionId = norm.sessionId || makeSessionId(r);
    var state = {
      v: STATE_VERSION,
      contentVersion: contentVersion,
      phase: PHASES.RELAY_TURN,
      turnState: TURN.HANDOVER,
      breakState: null,
      paused: false,
      status: 'active',
      sessionId: sessionId,
      level: norm.level,
      worldId: norm.worldId,
      builtWorld: norm.builtWorld,
      sparkIndex: sparkIndex,
      playerCount: norm.playerCount,
      useCharacters: norm.useCharacters,
      nicknames: norm.nicknames,
      characterIds: characterIds,
      maxRounds: def.maxRounds,
      turnSeconds: def.turnSeconds,
      twistRules: { maxRounds: def.maxRounds, twistWindows: def.twistWindows,
        minTwists: def.minTwists, maxTwists: def.maxTwists },
      round: 1,
      playerIndex: 0,
      turnIndex: 1,
      completedRounds: 0,
      promptId: null,
      promptHistory: [],
      secondsLeft: def.turnSeconds,
      overtime: false,
      micBlocked: false,
      recordUnavailable: false,
      storageFull: false,
      notice: null,
      autoStopped: false,
      twistIds: [],
      twistLog: [],
      softenedTwistIds: [],
      softenIds: [],
      pinnedTwist: null,
      turns: [],
      chosenFateId: null
    };
    return withNewPrompt(state, content, r);
  }

  function withNewPrompt(state, content, r) {
    var id = drawPromptId(content, state, PROMPT_NO_REPEAT, r);
    return update(state, {
      promptId: id,
      promptHistory: id ? state.promptHistory.concat([id]) : state.promptHistory
    });
  }

  function turnIdOf(state) {
    return state.sessionId + '-r' + state.round + '-p' + state.playerIndex;
  }

  function startTurn(state, changes, content, r) {
    var s = update(state, changes, {
      phase: PHASES.RELAY_TURN,
      turnState: TURN.HANDOVER,
      breakState: null,
      secondsLeft: state.turnSeconds,
      overtime: false,
      autoStopped: false
    });
    return withNewPrompt(s, content, r);
  }

  /* Close the current turn (TURN_DONE / TURN_PASSED are transient) and move on:
     next player's hand-over, the round break, or the Fate choice after the last round. */
  function endTurn(state, entry, notice, content, r) {
    var log = assign({
      turnId: turnIdOf(state),
      turnIndex: state.turnIndex,
      round: state.round,
      playerIndex: state.playerIndex,
      characterId: state.characterIds[state.playerIndex] || null,
      promptId: state.promptId,
      inputMethod: 'verbal-unrecorded',
      durationSeconds: 0,
      mimeType: null,
      byteSize: 0
    }, entry);
    var base = update(state, {
      turns: state.turns.concat([log]),
      notice: notice || null,
      autoStopped: false
    });
    var next = state.playerIndex + 1;
    if (next < state.playerCount) {
      return startTurn(base, { playerIndex: next, turnIndex: state.turnIndex + 1 }, content, r);
    }
    var closed = update(base, {
      turnState: null,
      completedRounds: state.round,
      secondsLeft: state.turnSeconds,
      overtime: false
    });
    if (state.round >= state.maxRounds) {
      // The last round break has no Twist check (DRD §5.2), so go straight to the Fates.
      return update(closed, { phase: PHASES.FATE_CHOICE, breakState: null, pinnedTwist: null, promptId: null });
    }
    return roundBreak(closed, content, r);
  }

  function roundBreak(state, content, r) {
    var s = update(state, { phase: PHASES.ROUND_BREAK, pinnedTwist: null, promptId: null });
    var p = twistChance(levelDef(content, state.level, state.twistRules), state.round, state.twistIds.length);
    var drawn = null;
    if (p > 0 && (p >= 1 || r() < p)) {
      var used = state.twistIds;
      var unused = worldTwists(worldOf(state, content)).filter(function (t) {
        return t && used.indexOf(t.id) < 0;
      });
      drawn = pick(unused, r) || null;
    }
    if (!drawn) return update(s, { breakState: BREAK.NEXT_ROUND });
    return update(s, {
      breakState: BREAK.TWIST_REVEAL,
      twistIds: state.twistIds.concat([drawn.id]),
      twistLog: state.twistLog.concat([{ round: state.round, twistId: drawn.id, softenId: null }]),
      pinnedTwist: { twistId: drawn.id, softenId: null, round: state.round }
    });
  }

  function canRecord(state) {
    return !state.micBlocked && !state.recordUnavailable && !state.storageFull;
  }

  // ---------------------------------------------------------------- guards

  var inTurn = function (s) { return s.phase === PHASES.RELAY_TURN; };

  // A session state must look like one the engine made (guards against garbage drafts).
  function wellFormed(state) {
    if (!isObj(state) || typeof state.phase !== 'string') return false;
    if (state.phase === PHASES.SETUP) return true;
    return state.v === STATE_VERSION && typeof state.sessionId === 'string' && Array.isArray(state.turns) &&
      Array.isArray(state.promptHistory) && Array.isArray(state.twistIds) && state.playerCount >= MIN_PLAYERS;
  }

  function canAct(state, type) {
    if (!wellFormed(state)) return false;
    var p = state.phase;
    var t = state.turnState;
    var paused = !!state.paused;
    switch (type) {
      case ACTIONS.START: return p === PHASES.SETUP;
      case ACTIONS.TICK: return inTurn(state) && (t === TURN.READY || t === TURN.RECORDING) && !paused && state.secondsLeft > 0;
      case ACTIONS.READY: return inTurn(state) && t === TURN.HANDOVER && !paused;
      case ACTIONS.RECORD_STARTED: return inTurn(state) && t === TURN.READY && !paused && canRecord(state);
      case ACTIONS.RECORD_STOPPED: return inTurn(state) && t === TURN.RECORDING;
      case ACTIONS.RECORD_SAVED: return inTurn(state) && (t === TURN.RECORDING || t === TURN.SAVING);
      case ACTIONS.RECORD_FAILED: return inTurn(state) && !!t;
      case ACTIONS.CONTINUE_UNRECORDED: return inTurn(state) && t === TURN.READY && !paused;
      case ACTIONS.REPLACE_PROMPT: return inTurn(state) && t === TURN.READY && !paused;
      case ACTIONS.PASS: return inTurn(state) && (t === TURN.HANDOVER || t === TURN.READY) && !paused;
      case ACTIONS.PAUSE:
        return !paused && (p === PHASES.RELAY_TURN || p === PHASES.ROUND_BREAK || p === PHASES.FATE_CHOICE);
      case ACTIONS.RESUME:
        return paused && (p === PHASES.RELAY_TURN || p === PHASES.ROUND_BREAK || p === PHASES.FATE_CHOICE);
      case ACTIONS.CONTINUE_AFTER_BREAK: return p === PHASES.ROUND_BREAK && !paused;
      case ACTIONS.SOFTEN_TWIST:
        if (!state.pinnedTwist || state.pinnedTwist.softenId) return false;
        return (p === PHASES.ROUND_BREAK && state.breakState === BREAK.TWIST_REVEAL) || p === PHASES.RELAY_TURN;
      case ACTIONS.CHOOSE_FATE: return p === PHASES.FATE_CHOICE && !paused;
      case ACTIONS.RESTART: return p === PHASES.EPILOGUE;
      case ACTIONS.ABANDON:
        // A recording must be stopped before the turn is left (DRD §2.2).
        return (p === PHASES.RELAY_TURN && t !== TURN.RECORDING) ||
          p === PHASES.ROUND_BREAK || p === PHASES.FATE_CHOICE;
    }
    return false;
  }

  // ---------------------------------------------------------------- reduce

  function createSession(config, content, rng) {
    var r = safeRng(rng);
    var check = validateConfig(config, content);
    if (!check.ok) {
      var s = setupState(null, null);
      if (isObj(config)) {
        s.setup = {
          level: LEVEL_DEFAULTS[config.level] ? config.level : 'sprout',
          playerCount: config.playerCount >= MIN_PLAYERS && config.playerCount <= MAX_PLAYERS
            ? Math.floor(config.playerCount) : 3,
          useCharacters: config.useCharacters !== false,
          nicknames: arr(config.nicknames).filter(function (x) { return typeof x === 'string' || x === null; })
        };
      }
      return s;
    }
    return startSession(check.normalized, content, r, content && content.version || null);
  }

  function reduce(state, action, content, rng) {
    try {
      return reduceInner(state, action, content, safeRng(rng));
    } catch (e) {
      // Never throw (DRD §2.4). A malformed state or content leaves the state unchanged.
      return state;
    }
  }

  function reduceInner(state, action, content, r) {
    if (!isObj(action) || typeof action.type !== 'string') return state;
    var type = action.type;
    if (!canAct(state, type)) return state;

    switch (type) {
      case ACTIONS.START: {
        var check = validateConfig(action.config, content);
        if (!check.ok) return state;
        return startSession(check.normalized, content, r, content && content.version || null);
      }

      case ACTIONS.TICK: {
        var left = state.secondsLeft - 1;
        return update(state, { secondsLeft: left, overtime: left <= 0 });
      }

      case ACTIONS.READY:
        return update(state, { turnState: TURN.READY, notice: null });

      case ACTIONS.RECORD_STARTED:
        return update(state, { turnState: TURN.RECORDING, autoStopped: false });

      case ACTIONS.RECORD_STOPPED:
        return update(state, { turnState: TURN.SAVING, autoStopped: !!action.autoStop });

      case ACTIONS.RECORD_SAVED: {
        if (action.turnId != null && action.turnId !== turnIdOf(state)) return state;
        var dur = Number(action.durationSeconds);
        var bytes = Number(action.byteSize);
        if (!(dur >= 0)) dur = 0;
        if (!(bytes >= 0)) bytes = 0;
        var hasAudio = bytes > 0;
        return endTurn(state, {
          inputMethod: hasAudio ? 'microphone' : 'verbal-unrecorded',
          durationSeconds: dur,
          mimeType: hasAudio && typeof action.mimeType === 'string' ? action.mimeType : null,
          byteSize: hasAudio ? bytes : 0
        }, state.autoStopped ? 'auto-stop' : null, content, r);
      }

      case ACTIONS.RECORD_FAILED: {
        var reason = action.reason;
        if (FAIL_REASONS.indexOf(reason) < 0) return state;
        if (reason === 'cancelled') {
          // Stop or Pause while the permission prompt was open (audio module): nothing was
          // recorded and the mic is NOT blocked. Back to the same turn, same prompt and time.
          if (state.turnState === TURN.RECORDING || state.turnState === TURN.SAVING) {
            return update(state, { turnState: TURN.READY, autoStopped: false });
          }
          return state;
        }
        var flags = {
          micBlocked: state.micBlocked || reason === 'denied',
          recordUnavailable: state.recordUnavailable || reason === 'unavailable' || reason === 'unsupported',
          storageFull: state.storageFull || reason === 'quota'
        };
        var t = state.turnState;
        if (t === TURN.RECORDING || t === TURN.SAVING) {
          var endNotice = { disconnected: 'mic-stopped', quota: 'storage-full', denied: 'mic-blocked' }[reason] ||
            'mic-missing';
          return endTurn(update(state, flags), { inputMethod: 'verbal-unrecorded' }, endNotice, content, r);
        }
        var notice = { denied: 'mic-blocked', unavailable: 'mic-missing', unsupported: 'mic-missing',
          quota: 'storage-full' }[reason] || state.notice;
        return update(state, flags, { notice: notice });
      }

      case ACTIONS.CONTINUE_UNRECORDED:
        return endTurn(state, { inputMethod: 'verbal-unrecorded' }, null, content, r);

      case ACTIONS.REPLACE_PROMPT: {
        // Excludes the current prompt and the 4 shown before it; timer and turnIndex unchanged.
        var id = drawPromptId(content, state, PROMPT_NO_REPEAT + 1, r);
        if (!id || id === state.promptId) return state;
        return update(state, { promptId: id, promptHistory: state.promptHistory.concat([id]) });
      }

      case ACTIONS.PASS:
        return endTurn(state, { inputMethod: 'passed' }, null, content, r);

      case ACTIONS.PAUSE:
        // Pausing stops an active recording; the UI saves it (RECORD_SAVED / RECORD_FAILED).
        return update(state, {
          paused: true,
          turnState: state.turnState === TURN.RECORDING ? TURN.SAVING : state.turnState
        });

      case ACTIONS.RESUME:
        return update(state, { paused: false });

      case ACTIONS.CONTINUE_AFTER_BREAK:
        return startTurn(state, { round: state.round + 1, playerIndex: 0, turnIndex: state.turnIndex + 1 },
          content, r);

      case ACTIONS.SOFTEN_TWIST: {
        var world = worldOf(state, content);
        if (!world) return state;
        var soft = null;
        if (world.kind === 'built') {
          var usedSoft = state.softenIds;
          var all = arr(world.softenTwists).filter(Boolean);
          var fresh = all.filter(function (x) { return usedSoft.indexOf(x.id) < 0; });
          soft = pick(fresh.length ? fresh : all, r) || null;
        } else {
          soft = world.softenTwist || null;
        }
        if (!soft || !soft.id) return state;
        var pin = state.pinnedTwist;
        return update(state, {
          pinnedTwist: assign({}, pin, { softenId: soft.id }),
          softenedTwistIds: state.softenedTwistIds.concat([pin.twistId]),
          softenIds: state.softenIds.concat([soft.id]),
          twistLog: state.twistLog.map(function (e) {
            return e.twistId === pin.twistId ? assign({}, e, { softenId: soft.id }) : e;
          })
        });
      }

      case ACTIONS.CHOOSE_FATE: {
        var fates = worldFates(worldOf(state, content));
        if (!findById(fates, action.fateId)) return state;
        return update(state, { phase: PHASES.EPILOGUE, status: 'completed', chosenFateId: action.fateId });
      }

      case ACTIONS.RESTART:
        return setupState(state, setupFrom(state));

      case ACTIONS.ABANDON:
        return setupState(update(state, { status: 'abandoned' }), setupFrom(state));
    }
    return state;
  }

  // ---------------------------------------------------------------- draft resume (DRD §8)

  /* resumeDraft(state, content) -> state | null
     Puts a saved draft back on the same player's hand-over screen: same prompt, saved
     secondsLeft, not paused. A draft saved while recording or saving loses that audio
     and resumes the same turn (Record available again after I'm ready!).
     Returns null if the draft can't be used with this content. The 12h rule is storage's. */
  function resumeDraft(state, content) {
    try {
      if (!isObj(state) || state.v !== STATE_VERSION || !PHASES[state.phase]) return null;
      if (state.phase === PHASES.SETUP || state.phase === PHASES.EPILOGUE) return null;
      if (!worldOf(state, content)) return null;
      if (state.phase === PHASES.RELAY_TURN) {
        if (!findById(content.prompts, state.promptId)) return null;
        return update(state, { turnState: TURN.HANDOVER, paused: false, notice: null, autoStopped: false });
      }
      return update(state, { paused: false });
    } catch (e) {
      return null;
    }
  }

  /* actionForClip(rec, saved, turnId) -> the RECORD_SAVED / RECORD_FAILED action that ends a
     recorded turn. rec = audio.stopRecording() result; saved = storage.saveTurn() result,
     or null when nothing was saved. A turn without saved audio counts as told out loud. */
  /* How long a recording may run if it starts now (decision 2026-10-29): the time left on
     the turn plus a grace to finish the thought, at least 20 s, never above the 60 s cap. */
  var REC_GRACE = 15, REC_MIN = 20, REC_CAP = 60;
  function recordLimitSeconds(state) {
    var left = Math.max(0, (state && state.secondsLeft) || 0);
    return Math.min(REC_CAP, Math.max(REC_MIN, left + REC_GRACE));
  }

  function actionForClip(rec, saved, turnId) {
    var dur = (rec && rec.durationSeconds) || 0;
    var unrecorded = { type: ACTIONS.RECORD_SAVED, turnId: turnId, durationSeconds: dur, byteSize: 0 };
    if (!rec || !rec.ok) {
      return rec && rec.cause === 'disconnect' ? { type: ACTIONS.RECORD_FAILED, reason: 'disconnected' } : unrecorded;
    }
    if (saved && saved.ok && !saved.audioDropped) {
      return { type: ACTIONS.RECORD_SAVED, turnId: turnId, durationSeconds: dur, mimeType: rec.mimeType,
        byteSize: (rec.blob && rec.blob.size) || 0 };
    }
    if (saved && saved.reason === 'quota') return { type: ACTIONS.RECORD_FAILED, reason: 'quota' };
    return unrecorded;
  }

  /* withoutNicknames(state) -> state with every nickname cleared (after "Delete this
     story's voices and names", so labels fall back to character / "Player N"). */
  function withoutNicknames(state) {
    if (!isObj(state)) return state;
    var changes = {};
    if (Array.isArray(state.nicknames)) changes.nicknames = state.nicknames.map(function () { return null; });
    if (isObj(state.setup)) changes.setup = assign({}, state.setup, { nicknames: [] });
    return update(state, changes);
  }

  // ---------------------------------------------------------------- labels and view

  /* Display label (decision 2026-10-20): nickname, else character name, else "Player N".
     Both when both exist: "Maya · The Curious Inventor". */
  function labelFor(state, playerIndex, content) {
    if (!isObj(state)) return 'Player ' + (Number(playerIndex) + 1);
    var nick = arr(state.nicknames)[playerIndex] || null;
    var ch = findById(content && content.characters, arr(state.characterIds)[playerIndex]);
    var chName = ch && ch.name ? ch.name : null;
    if (nick && chName) return nick + ' · ' + chName;
    if (nick) return nick;
    if (chName) return chName;
    return 'Player ' + (playerIndex + 1);
  }

  function playerView(state, i, content) {
    if (i == null || i < 0 || i >= state.playerCount) return null;
    var cid = arr(state.characterIds)[i] || null;
    var ch = findById(content && content.characters, cid);
    return {
      index: i,
      label: labelFor(state, i, content),
      nickname: arr(state.nicknames)[i] || null,
      characterId: cid,
      characterName: ch ? ch.name : null,
      characterIcon: ch ? ch.icon : null
    };
  }

  function worldView(world, state) {
    if (!world) return null;
    var spark = null;
    if (world.kind === 'built') {
      spark = state.sparkIndex != null ? (arr(world.sparks)[state.sparkIndex] || null) : null;
    } else {
      spark = world.spark || null;
    }
    return {
      id: world.id,
      kind: world.kind,
      title: world.title,
      text: world.world,
      questTitle: world.questTitle,
      quest: world.quest,
      icon: world.icon,
      worldType: world.worldType || null,
      spark: spark,
      choices: world.choices || null
    };
  }

  function twistView(state, world) {
    var pin = state.pinnedTwist;
    if (!pin) return null;
    var original = findById(worldTwists(world), pin.twistId);
    var soft = pin.softenId ? softenById(world, pin.softenId) : null;
    var shown = soft || original;
    if (!shown) return null;
    return {
      id: shown.id,
      originalId: pin.twistId,
      name: shown.name,
      text: levelText(shown, state.level),
      softened: !!soft,
      round: pin.round,
      canSoften: canAct(state, ACTIONS.SOFTEN_TWIST),
      // First turn after the reveal shows the full text (screen flow T1.twist).
      fresh: state.phase === PHASES.RELAY_TURN && state.round === pin.round + 1 && state.playerIndex === 0
    };
  }

  function screenOf(state) {
    switch (state.phase) {
      case PHASES.SETUP: return 'setup';
      case PHASES.RELAY_TURN:
        return { TURN_HANDOVER: 'handover', TURN_READY: 'turn', TURN_RECORDING: 'recording',
          TURN_SAVING: 'saving' }[state.turnState] || 'turn';
      case PHASES.ROUND_BREAK: return state.breakState === BREAK.TWIST_REVEAL ? 'twist' : 'round-break';
      case PHASES.FATE_CHOICE: return 'fate';
      case PHASES.EPILOGUE: return 'epilogue';
    }
    return 'setup';
  }

  /* getView(state, content) -> everything the UI renders. Plain data; the UI never reads
     state fields directly. Text is already in the active level's wording. */
  function getView(state, content) {
    try {
      return getViewInner(state, content);
    } catch (e) {
      // Never throw: a broken state renders as Setup.
      return { screen: 'setup', phase: PHASES.SETUP, paused: false, setup: null, broken: true };
    }
  }

  function getViewInner(state, content) {
    if (!isObj(state)) return { screen: 'setup', phase: PHASES.SETUP, setup: null };
    if (state.phase === PHASES.SETUP) {
      return {
        screen: 'setup',
        phase: PHASES.SETUP,
        paused: false,
        lastStatus: state.status || null,
        lastSessionId: state.sessionId || null,
        setup: assign({}, state.setup, { nicknames: arr(state.setup && state.setup.nicknames).slice() })
      };
    }

    var world = worldOf(state, content);
    var level = state.level;
    var inRelay = state.phase === PHASES.RELAY_TURN;
    var handover = inRelay && state.turnState === TURN.HANDOVER;
    var prompt = null;
    if (inRelay && !handover) {
      var p = findById(content && content.prompts, state.promptId);
      if (p) prompt = { id: p.id, text: fillPrompt(p.text, world), category: p.category || null };
    }
    var isFirstTurn = state.round === 1 && state.playerIndex === 0;
    // Spark (decision 2026-10-23): Round 1 only, until someone tells. If Player 1 passes,
    // it moves to the next player's turn; it never appears after Round 1. Derived from the
    // turn log, so a resumed draft behaves the same.
    var sparkTurn = state.round === 1 && !arr(state.turns).some(function (t) {
      return t && t.inputMethod !== 'passed';
    });

    var roster = [];
    for (var i = 0; i < state.playerCount; i++) {
      var pv = playerView(state, i, content);
      pv.active = inRelay && i === state.playerIndex;
      roster.push(pv);
    }
    var active = inRelay ? playerView(state, state.playerIndex, content) : null;
    var nextIdx = inRelay ? (state.playerIndex + 1) % state.playerCount : 0;

    var showFates = state.phase === PHASES.FATE_CHOICE || state.phase === PHASES.EPILOGUE;
    var fates = showFates ? worldFates(world).map(function (f) {
      return { id: f.id, type: f.type, text: levelText(f, level), closer: f.closer || null };
    }) : [];
    var chosen = state.phase === PHASES.EPILOGUE ? (findById(fates, state.chosenFateId) || null) : null;

    var album = state.turns.map(function (t) {
      var pr = findById(content && content.prompts, t.promptId);
      return {
        turnId: t.turnId,
        turnIndex: t.turnIndex,
        round: t.round,
        playerIndex: t.playerIndex,
        label: labelFor(state, t.playerIndex, content),
        characterId: t.characterId,
        promptId: t.promptId,
        promptText: pr ? fillPrompt(pr.text, world) : '',
        inputMethod: t.inputMethod,
        durationSeconds: t.durationSeconds,
        mimeType: t.mimeType,
        hasAudio: t.inputMethod === 'microphone'
      };
    });
    var passes = state.turns.filter(function (t) { return t.inputMethod === 'passed'; }).length;
    var prev = state.turns.length ? state.turns[state.turns.length - 1] : null;

    var can = {};
    for (var k in ACTIONS) {
      if (Object.prototype.hasOwnProperty.call(ACTIONS, k)) can[ACTIONS[k]] = canAct(state, ACTIONS[k]);
    }

    return {
      screen: screenOf(state),
      phase: state.phase,
      turnState: state.turnState || null,
      breakState: state.breakState || null,
      paused: !!state.paused,
      status: state.status,
      sessionId: state.sessionId,
      level: level,
      world: worldView(world, state),
      round: state.round,
      maxRounds: state.maxRounds,
      roundsDone: state.completedRounds,
      // Round break: is the round about to start the last one? (R1 "last-round" line)
      nextRoundIsLast: state.phase === PHASES.ROUND_BREAK && state.round + 1 === state.maxRounds,
      turnInRound: inRelay ? state.playerIndex + 1 : null,
      turnNumber: inRelay ? state.turnIndex : null,
      totalTurns: state.maxRounds * state.playerCount,
      isFirstTurn: inRelay && isFirstTurn,
      player: active,
      nextPlayer: inRelay ? playerView(state, nextIdx, content) : null,
      previousTurn: prev ? {
        inputMethod: prev.inputMethod,
        playerIndex: prev.playerIndex,
        label: labelFor(state, prev.playerIndex, content)
      } : null,
      roster: roster,
      showPrompt: !!prompt,
      prompt: prompt,
      spark: inRelay && !handover && sparkTurn && world ? (worldView(world, state).spark || null) : null,
      twist: state.phase === PHASES.RELAY_TURN || state.phase === PHASES.ROUND_BREAK ? twistView(state, world) : null,
      timer: {
        secondsLeft: state.secondsLeft,
        turnSeconds: state.turnSeconds,
        fraction: state.turnSeconds > 0 ? Math.max(0, state.secondsLeft) / state.turnSeconds : 0,
        overtime: !!state.overtime,
        running: inRelay && (state.turnState === TURN.READY || state.turnState === TURN.RECORDING) && !state.paused && state.secondsLeft > 0
      },
      overtime: !!state.overtime,
      secondsLeft: state.secondsLeft,
      recordOffered: canRecord(state),
      micBlocked: !!state.micBlocked,
      recordUnavailable: !!state.recordUnavailable,
      storageFull: !!state.storageFull,
      notice: state.notice || null,
      currentTurnId: inRelay ? turnIdOf(state) : null,
      fates: fates,
      chosenFate: chosen,
      album: album,
      counts: {
        turns: state.turns.length,
        turnsTold: state.turns.length - passes,
        passes: passes,
        recorded: album.filter(function (a) { return a.hasAudio; }).length,
        twists: state.twistIds.length,
        softened: state.softenedTwistIds.length
      },
      can: can
    };
  }

  return {
    ACTIONS: ACTIONS,
    PHASES: PHASES,
    TURN: TURN,
    BREAK: BREAK,
    STATE_VERSION: STATE_VERSION,
    createSession: createSession,
    reduce: reduce,
    getView: getView,
    labelFor: labelFor,
    buildWorld: buildWorld,
    validateConfig: validateConfig,
    canAct: canAct,
    resumeDraft: resumeDraft,
    withoutNicknames: withoutNicknames,
    actionForClip: actionForClip,
    recordLimitSeconds: recordLimitSeconds,
    twistChance: twistChance,
    storyStage: storyStage,
    fillPrompt: fillPrompt
  };
})();
