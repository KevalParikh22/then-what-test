/* Then What?! — engine tests (task 4.1). Zero dependencies.
   Runs in web/tests.html (results on the page, title "PASS"/"FAIL", console output) or in
   Node with a tiny shim that defines `window` (see docs/architecture/2026-10-23-engine-notes.md).
   Tests run against a small fixture that follows DRD §3.1; when ThenWhat.content is loaded,
   the property tests run against the real content too.
   Other test files may register more tests with ThenWhat.tests.add(name, fn) before the run. */
window.ThenWhat = window.ThenWhat || {};
ThenWhat.tests = (function () {
  'use strict';

  // ------------------------------------------------------------- tiny runner

  var registered = [];
  var results = [];

  /* Quick mode (decision 2026-10-23): tests.html?quick runs the Twist simulations with 500
     games instead of 10,000 (DRD §10.1 default), for phones. In Node, set
     ThenWhat.testQuick = true before loading this file. */
  var QUICK = (function () {
    if (window.ThenWhat && window.ThenWhat.testQuick === true) return true;
    try {
      var q = window.location && window.location.search;
      return typeof q === 'string' && /(^\?|&)quick(=[^&]*)?(&|$)/.test(q);
    } catch (e) { return false; }
  })();
  var SIM_GAMES = QUICK ? 500 : 10000;        // fixture Twist simulations
  var REAL_SIM_GAMES = QUICK ? 500 : 2000;    // real-content Twist simulations
  var MODE = QUICK ? 'quick' : 'full';
  var MODE_LINE = QUICK
    ? 'Quick mode: Twist simulations use 500 games (full run: 10,000, DRD §10.1).'
    : 'Full mode: Twist simulations use 10,000 games (DRD §10.1). Add ?quick for 500.';
  // Distribution tolerance: ±0.03 at 10,000 games (DRD), widened to 4 standard errors for
  // smaller runs so a quick run checks the shape without being flaky.
  function simTolerance(p, n) { return Math.max(0.03, 4 * Math.sqrt(p * (1 - p) / n)); }

  function add(name, fn) { registered.push({ name: name, fn: fn }); }

  /* addGroup(name, fn): fn(check) may call check(condition, message) many times; each call
     becomes one result row ("name: message"). Used for ThenWhat.contentTests. */
  function addGroup(name, fn) { registered.push({ name: name, fn: fn, group: true }); }

  function AssertionError(msg) { this.message = msg; this.name = 'AssertionError'; }
  AssertionError.prototype = Object.create(Error.prototype);

  function fail(msg) { throw new AssertionError(msg); }
  function show(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
      if (!deepEqual(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }

  var assert = {
    ok: function (v, msg) { if (!v) fail(msg || 'expected truthy, got ' + show(v)); },
    eq: function (a, b, msg) { if (a !== b) fail((msg ? msg + ': ' : '') + 'expected ' + show(b) + ', got ' + show(a)); },
    ne: function (a, b, msg) { if (a === b) fail((msg ? msg + ': ' : '') + 'did not expect ' + show(a)); },
    deepEq: function (a, b, msg) { if (!deepEqual(a, b)) fail((msg ? msg + ': ' : '') + 'expected ' + show(b) + ', got ' + show(a)); },
    same: function (a, b, msg) { if (a !== b) fail((msg ? msg + ': ' : '') + 'expected the same object back'); },
    near: function (a, b, tol, msg) { if (Math.abs(a - b) > tol) fail((msg ? msg + ': ' : '') + 'expected ' + b + ' ± ' + tol + ', got ' + a); },
    deepEqual: deepEqual
  };

  function runOne(t) {
    if (t.group) { runGroup(t); return; }
    var start = Date.now();
    try {
      t.fn(assert);
      results.push({ name: t.name, ok: true, ms: Date.now() - start });
    } catch (e) {
      results.push({ name: t.name, ok: false, ms: Date.now() - start, error: (e && e.message) || String(e),
        stack: e && e.name !== 'AssertionError' ? e.stack : null });
    }
  }

  function finish(t0) {
    var failed = results.filter(function (r) { return !r.ok; }).length;
    var summary = { total: results.length, passed: results.length - failed, failed: failed, ms: Date.now() - t0, mode: MODE };
    report(summary);
    return summary;
  }

  // Synchronous run (Node shim). Returns the summary.
  function run() {
    results = [];
    var t0 = Date.now();
    for (var i = 0; i < registered.length; i++) runOne(registered[i]);
    return finish(t0);
  }

  // Browser run: yields between tests so the page can show progress (the Twist simulations
  // take a few seconds each). Calls done(summary) at the end.
  function runAsync(done) {
    results = [];
    var t0 = Date.now();
    var i = 0;
    var sum = typeof document !== 'undefined' ? document.getElementById('summary') : null;
    (function next() {
      if (i >= registered.length) { var s = finish(t0); if (done) done(s); return; }
      if (sum) sum.textContent = 'Running ' + (i + 1) + ' of ' + registered.length + ': ' + registered[i].name;
      runOne(registered[i++]);
      setTimeout(next, 0);
    })();
  }

  function runGroup(t) {
    var start = Date.now();
    var n = 0;
    try {
      t.fn(function (cond, msg) {
        n++;
        results.push({ name: t.name + ': ' + (msg || 'check ' + n), ok: !!cond, ms: 0,
          error: cond ? null : 'check failed' });
      });
      if (!n) results.push({ name: t.name, ok: false, ms: Date.now() - start, error: 'no checks ran' });
    } catch (e) {
      results.push({ name: t.name + ' (threw)', ok: false, ms: Date.now() - start, error: (e && e.message) || String(e),
        stack: e && e.stack });
    }
  }

  function report(summary) {
    var line = (summary.failed ? 'FAIL' : 'PASS') + ': ' + summary.passed + '/' + summary.total +
      ' tests passed in ' + summary.ms + ' ms (' + MODE + ' mode)' + (summary.failed ? ' (' + summary.failed + ' failed)' : '');
    results.forEach(function (r) {
      if (r.ok) console.log('  ok   ' + r.name + ' (' + r.ms + ' ms)');
      else console.error('  FAIL ' + r.name + ': ' + r.error + (r.stack ? '\n' + r.stack : ''));
    });
    (summary.failed ? console.error : console.log)(line);
    if (typeof document === 'undefined') return;
    document.title = summary.failed ? 'FAIL' : 'PASS';
    showMode();
    var sum = document.getElementById('summary');
    if (sum) { sum.textContent = line; sum.setAttribute('data-result', summary.failed ? 'fail' : 'pass'); }
    var list = document.getElementById('results');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    results.forEach(function (r) {
      var li = document.createElement('li');
      li.className = r.ok ? 'pass' : 'fail';
      li.textContent = (r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : ': ' + r.error) + '  (' + r.ms + ' ms)';
      list.appendChild(li);
    });
  }

  function showMode() {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('mode');
    if (el) { el.textContent = MODE_LINE; el.setAttribute('data-mode', MODE); }
  }

  // ------------------------------------------------------------- helpers

  // mulberry32: small deterministic PRNG returning [0, 1).
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }

  function lvl(id, sprout, weaver) { return { id: id, name: id, sprout: sprout, weaver: weaver }; }

  // ------------------------------------------------------------- fixture (DRD §3.1 shape)

  function makeFixture() {
    function prompts(level, n) {
      var out = [];
      for (var i = 1; i <= n; i++) {
        out.push({ id: level + '-p' + i, text: level + ' prompt ' + i + '?', category: 'object', level: level,
          readingGrade: level === 'weaver' ? 4 : 1.5 });
      }
      return out;
    }
    function fates(prefix) {
      // Deliberately out of order: the engine must sort solved, changed, to-be-continued.
      return [
        { id: prefix + '-f-continued', type: 'to-be-continued', sprout: prefix + ' continued S', weaver: prefix + ' continued W', closer: 'Where next?' },
        { id: prefix + '-f-solved', type: 'solved', sprout: prefix + ' solved S', weaver: prefix + ' solved W', closer: 'Best part?' },
        { id: prefix + '-f-changed', type: 'changed', sprout: prefix + ' changed S', weaver: prefix + ' changed W' }
      ];
    }
    function twists(prefix, n) {
      var out = [];
      for (var i = 1; i <= n; i++) out.push(lvl(prefix + '-t' + i, prefix + ' twist ' + i + ' S', prefix + ' twist ' + i + ' W'));
      return out;
    }
    return {
      version: 'fixture-1',
      levels: {
        sprout: { id: 'sprout', maxRounds: 4, turnSeconds: 30, twistWindows: [2, 3], minTwists: 1, maxTwists: 1 },
        weaver: { id: 'weaver', maxRounds: 5, turnSeconds: 45, twistWindows: [2, 3, 4], minTwists: 1, maxTwists: 2 }
      },
      worlds: [
        { id: 'w-one', title: 'World One', kind: 'ready-made', worldType: 'everyday', icon: 'world-one',
          world: 'A first test world for the engine.', quest: 'Find the first test thing.', questTitle: 'Find it',
          spark: 'What do you see first?', twists: twists('one', 4),
          softenTwist: lvl('one-soft', 'one soft S', 'one soft W'), fates: fates('one') },
        { id: 'w-two', title: 'World Two', kind: 'ready-made', worldType: 'fantasy', icon: 'world-two',
          world: 'A second test world for the engine.', quest: 'Fix the second test thing.', questTitle: 'Fix it',
          spark: 'Who is here?', twists: twists('two', 5),
          softenTwist: { id: 'two-soft', name: 'Two Soft', sprout: 'two soft S' }, // weaver text missing: fallback
          fates: fates('two') }
      ],
      prompts: prompts('sprout', 6).concat(prompts('weaver', 6), prompts('all', 2)),
      characters: [1, 2, 3, 4, 5, 6, 7].map(function (i) {
        return { id: 'ch-' + i, name: 'Character ' + i, trait: 'Trait ' + i, icon: 'char-' + i };
      }),
      builder: {
        where: [
          { id: 'museum', label: 'Museum', icon: 'where-museum', phrase: 'A museum' },
          { id: 'school', label: 'School', icon: 'where-school', phrase: 'A school' },
          { id: 'spooky-house', label: 'Spooky House', icon: 'where-spooky-house', phrase: 'A spooky but friendly old house', levels: ['weaver'] }
        ],
        when: [
          { id: 'future', label: 'The Future', icon: 'when-future', phrase: 'in the future' },
          { id: 'today', label: 'Today', icon: 'when-today', phrase: 'today' }
        ],
        kind: [{ id: 'mystery', label: 'Mystery', icon: 'kind-mystery', phrase: 'A mystery story.' }],
        mission: [{ id: 'find-lost', label: 'Find something lost', icon: 'quest-find-lost',
          phrase: 'Find something lost', questTitle: 'Lost and found', questText: 'Something special is lost. Find it and bring it back.' }],
        worldTitleTemplate: '{where.label} · {when.label}',
        worldTemplate: '{where.phrase} {when.phrase}. {kind.phrase}',
        questTitleTemplate: '{mission.questTitle}',
        questTemplate: '{mission.questText}'
      },
      anyWorld: {
        twists: twists('any', 5),
        softenTwists: [lvl('any-soft1', 'soft one S', 'soft one W'), lvl('any-soft2', 'soft two S', 'soft two W')],
        fates: fates('any'),
        sparks: ['Any spark one?', 'Any spark two?']
      },
      ui: { pass: 'Passing the story to [name]!' },
      uiIcons: { pass: 'ui-pass' }
    };
  }

  var FX = makeFixture();
  var E = ThenWhat.engine;
  var A = E && E.ACTIONS;
  var BUILT = { where: 'museum', when: 'future', kind: 'mystery', mission: 'find-lost' };

  function cfg(over) {
    var c = { level: 'sprout', worldId: 'w-one', playerCount: 3, useCharacters: true, nicknames: [] };
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) c[k] = over[k];
    if (over && over.builtWorld) delete c.worldId;
    return c;
  }

  function start(over, seed, content) {
    return E.createSession(cfg(over || {}), content || FX, mulberry32(seed || 1));
  }

  function act(state, type, payload, content, rng) {
    var a = { type: type };
    if (payload) for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) a[k] = payload[k];
    return E.reduce(state, a, content || FX, rng || mulberry32(7));
  }

  function chain(state, types, content) {
    for (var i = 0; i < types.length; i++) state = act(state, types[i], null, content);
    return state;
  }

  // Finish turns (READY + CONTINUE) until the phase changes away from RELAY_TURN.
  function finishRound(state, content) {
    var guard = 0;
    while (state.phase === 'RELAY_TURN' && guard++ < 20) state = chain(state, [A.READY, A.CONTINUE_UNRECORDED], content);
    return state;
  }

  // Play a whole game. policy(r) -> 'continue' | 'pass' | 'pass-handover' | 'record'.
  function playGame(content, config, gameRng, decideRng, opts) {
    opts = opts || {};
    var s = E.createSession(config, content, gameRng);
    var steps = 0;
    var onStep = opts.onStep || function () {};
    function step(type, payload) {
      var a = { type: type };
      if (payload) for (var k in payload) a[k] = payload[k];
      var n = E.reduce(s, a, content, gameRng);
      onStep(s, a, n);
      s = n;
      steps++;
    }
    while (s.phase !== 'FATE_CHOICE' && steps < 1000) {
      if (s.phase === 'ROUND_BREAK') {
        if (s.breakState === 'TWIST_REVEAL' && opts.softenRate && decideRng() < opts.softenRate) step(A.SOFTEN_TWIST);
        step(A.CONTINUE_AFTER_BREAK);
        continue;
      }
      if (s.turnState === 'TURN_HANDOVER') {
        if (opts.passRate && decideRng() < opts.passRate) { step(A.PASS); continue; }
        step(A.READY);
        continue;
      }
      var d = decideRng();
      if (opts.recordRate && d < opts.recordRate) {
        step(A.RECORD_STARTED);
        step(A.RECORD_STOPPED);
        step(A.RECORD_SAVED, { turnId: s.sessionId + '-r' + s.round + '-p' + s.playerIndex, durationSeconds: 5, mimeType: 'audio/webm', byteSize: 1000 });
      } else if (opts.replaceRate && d < opts.recordRate + opts.replaceRate) {
        step(A.REPLACE_PROMPT);
      } else {
        step(A.CONTINUE_UNRECORDED);
      }
    }
    return { state: s, steps: steps };
  }

  // ------------------------------------------------------------- state samples for the guard matrix

  function samples() {
    var setup = E.createSession({}, FX, mulberry32(1));
    var handover = start({}, 3);
    var ready = act(handover, A.READY);
    var recording = act(ready, A.RECORD_STARTED);
    var saving = act(recording, A.RECORD_STOPPED);
    var pausedReady = act(ready, A.PAUSE);
    var pausedHandover = act(handover, A.PAUSE);
    // Weaver round 3 always has a Twist if round 2 had none; find both break kinds by seed.
    var breakNoTwist = null, breakTwist = null;
    for (var seed = 1; seed < 200 && !(breakNoTwist && breakTwist); seed++) {
      var s = start({ level: 'weaver' }, seed);
      s = finishRound(s);              // round 1 break: never a Twist
      if (!breakNoTwist) breakNoTwist = s;
      s = finishRound(act(s, A.CONTINUE_AFTER_BREAK));
      if (s.breakState === 'TWIST_REVEAL') breakTwist = s;
    }
    var fate = start({}, 5);
    while (fate.phase !== 'FATE_CHOICE') {
      fate = fate.phase === 'ROUND_BREAK' ? act(fate, A.CONTINUE_AFTER_BREAK) : finishRound(fate);
    }
    var epilogue = act(fate, A.CHOOSE_FATE, { fateId: 'one-f-solved' });
    return {
      SETUP: setup, HANDOVER: handover, READY: ready, RECORDING: recording, SAVING: saving,
      PAUSED_READY: pausedReady, PAUSED_HANDOVER: pausedHandover, BREAK: breakNoTwist, TWIST: breakTwist,
      FATE: fate, EPILOGUE: epilogue
    };
  }

  // Valid payloads per action, used by the matrix.
  function payloadFor(type, state) {
    switch (type) {
      case 'START': return { config: cfg({}) };
      case 'RECORD_SAVED': return { turnId: state.sessionId + '-r' + state.round + '-p' + state.playerIndex, durationSeconds: 3, mimeType: 'audio/webm', byteSize: 10 };
      case 'RECORD_FAILED': return { reason: 'disconnected' };
      case 'CHOOSE_FATE': return { fateId: 'one-f-solved' };
    }
    return null;
  }

  // Which actions are allowed in which sample (DRD §2.1 / §2.2 / §2.4 plus engine notes).
  var ALLOWED = {
    SETUP: ['START'],
    HANDOVER: ['READY', 'PASS', 'PAUSE', 'RECORD_FAILED', 'ABANDON'],
    READY: ['TICK', 'RECORD_STARTED', 'CONTINUE_UNRECORDED', 'REPLACE_PROMPT', 'PASS', 'PAUSE', 'RECORD_FAILED', 'ABANDON'],
    RECORDING: ['TICK', 'RECORD_STOPPED', 'RECORD_SAVED', 'RECORD_FAILED', 'PAUSE'],
    SAVING: ['RECORD_SAVED', 'RECORD_FAILED', 'PAUSE', 'ABANDON'],
    PAUSED_READY: ['RESUME', 'RECORD_FAILED', 'ABANDON'],
    PAUSED_HANDOVER: ['RESUME', 'RECORD_FAILED', 'ABANDON'],
    BREAK: ['PAUSE', 'CONTINUE_AFTER_BREAK', 'ABANDON'],
    TWIST: ['PAUSE', 'CONTINUE_AFTER_BREAK', 'SOFTEN_TWIST', 'ABANDON'],
    FATE: ['PAUSE', 'CHOOSE_FATE', 'ABANDON'],
    EPILOGUE: ['RESTART']
  };

  // ------------------------------------------------------------- tests: API and setup

  add('engine and action constants exist', function (t) {
    t.ok(E, 'ThenWhat.engine is loaded');
    ['createSession', 'reduce', 'getView', 'labelFor', 'buildWorld', 'validateConfig', 'canAct', 'resumeDraft']
      .forEach(function (f) { t.eq(typeof E[f], 'function', f); });
    var names = ['START', 'TICK', 'READY', 'RECORD_STARTED', 'RECORD_STOPPED', 'RECORD_SAVED', 'RECORD_FAILED',
      'CONTINUE_UNRECORDED', 'REPLACE_PROMPT', 'PASS', 'PAUSE', 'RESUME', 'CONTINUE_AFTER_BREAK', 'SOFTEN_TWIST',
      'CHOOSE_FATE', 'RESTART', 'ABANDON'];
    names.forEach(function (n) { t.eq(A[n], n, 'ACTIONS.' + n); });
    t.eq(Object.keys(A).length, names.length, 'no extra action types');
  });

  add('createSession with a valid config starts on Player 1 hand-over', function (t) {
    var s = start({}, 1);
    t.eq(s.phase, 'RELAY_TURN'); t.eq(s.turnState, 'TURN_HANDOVER'); t.eq(s.status, 'active');
    t.eq(s.round, 1); t.eq(s.playerIndex, 0); t.eq(s.turnIndex, 1);
    t.eq(s.maxRounds, 4); t.eq(s.turnSeconds, 30); t.eq(s.secondsLeft, 30); t.eq(s.overtime, false);
    t.eq(s.paused, false); t.ok(/^sprout-|^all-/.test(s.promptId), 'prompt from the Sprout pool');
    t.deepEq(s.promptHistory, [s.promptId]);
    var w = start({ level: 'weaver' }, 1);
    t.eq(w.maxRounds, 5); t.eq(w.turnSeconds, 45); t.eq(w.secondsLeft, 45);
  });

  add('setup guards: world, level, player count 2-6, nicknames, characters', function (t) {
    function errs(over) { return E.validateConfig(cfg(over), FX).errors; }
    t.deepEq(errs({}), []);
    t.ok(errs({ worldId: null }).indexOf('pick-world') >= 0, 'no world');
    t.ok(errs({ worldId: 'nope' }).indexOf('bad-world') >= 0, 'unknown world');
    t.ok(errs({ level: 'storm' }).indexOf('level') >= 0, 'unknown level');
    [1, 7, 0, -2, 2.5, '3', null, NaN].forEach(function (n) {
      t.ok(errs({ playerCount: n }).indexOf('player-count') >= 0, 'playerCount ' + String(n));
    });
    [2, 3, 4, 5, 6].forEach(function (n) { t.deepEq(errs({ playerCount: n }), [], 'playerCount ' + n); });
    t.ok(errs({ nicknames: ['abcdefghijklm'] }).indexOf('nickname-too-long') >= 0, '13 chars');
    t.deepEq(errs({ nicknames: ['  abcdefghijkl  '] }), [], '12 chars after trim');
    t.ok(errs({ builtWorld: { where: 'museum', when: 'future', kind: 'mystery' } }).indexOf('bad-world') >= 0, 'built needs 4 picks');
    t.ok(errs({ builtWorld: { where: 'spooky-house', when: 'today', kind: 'mystery', mission: 'find-lost' } }).indexOf('world-level') >= 0, 'Spooky House at Sprout');
    t.deepEq(errs({ level: 'weaver', builtWorld: { where: 'spooky-house', when: 'today', kind: 'mystery', mission: 'find-lost' } }), [], 'Spooky House at Weaver');
    var few = makeFixture(); few.characters = few.characters.slice(0, 2);
    t.ok(E.validateConfig(cfg({ playerCount: 3 }), few).errors.indexOf('not-enough-characters') >= 0);
    t.deepEq(E.validateConfig(cfg({ playerCount: 3, useCharacters: false }), few).errors, []);
    t.eq(E.validateConfig(null, FX).ok, false);
  });

  add('createSession with a bad config returns a SETUP state, never throws', function (t) {
    [undefined, null, 5, 'x', {}, cfg({ playerCount: 7 }), cfg({ worldId: null })].forEach(function (c) {
      var s = E.createSession(c, FX, mulberry32(1));
      t.eq(s.phase, 'SETUP', show(c));
    });
    t.eq(E.createSession(cfg({}), null, null).phase, 'SETUP', 'no content');
  });

  add('START from SETUP validates the config; invalid START leaves state unchanged', function (t) {
    var setup = E.createSession({}, FX, mulberry32(1));
    var started = act(setup, A.START, { config: cfg({ playerCount: 2 }) });
    t.eq(started.phase, 'RELAY_TURN'); t.eq(started.playerCount, 2);
    t.same(act(setup, A.START, { config: cfg({ playerCount: 1 }) }), setup);
    t.same(act(setup, A.START, {}), setup);
    t.same(act(started, A.START, { config: cfg({}) }), started, 'START outside SETUP');
  });

  add('sessionId: top-level string, from config.sessionId or the injected rng (deterministic)', function (t) {
    var a = start({}, 42), b = start({}, 42), c = start({}, 43);
    t.eq(typeof a.sessionId, 'string'); t.ok(/^s-[a-z0-9]{16}$/.test(a.sessionId), a.sessionId);
    t.eq(a.sessionId, b.sessionId, 'same seed, same id'); t.ne(a.sessionId, c.sessionId, 'other seed, other id');
    t.eq(start({ sessionId: 'abc-123' }, 1).sessionId, 'abc-123', 'config.sessionId is used');
    t.ok(/^s-/.test(start({ sessionId: 'bad id!' }, 1).sessionId), 'unsafe config id replaced');
    t.eq(E.getView(a, FX).sessionId, a.sessionId);
    t.eq(act(act(a, A.READY), A.ABANDON).sessionId, a.sessionId, 'kept on ABANDON for storage');
  });

  add('nicknames are trimmed, empty ones become null, characters are unique', function (t) {
    var s = start({ playerCount: 4, nicknames: [' Maya ', '', null, 'Sam'] }, 2);
    t.deepEq(s.nicknames, ['Maya', null, null, 'Sam']);
    t.eq(s.characterIds.length, 4);
    var uniq = s.characterIds.filter(function (c, i) { return s.characterIds.indexOf(c) === i; });
    t.eq(uniq.length, 4, 'no repeated characters');
    s.characterIds.forEach(function (c) { t.ok(/^ch-\d$/.test(c)); });
    var off = start({ playerCount: 4, useCharacters: false }, 2);
    t.deepEq(off.characterIds, [null, null, null, null]);
    t.eq(start({}, 2).useCharacters, true, 'characters on by default');
  });

  // ------------------------------------------------------------- tests: guard matrix

  add('every action is allowed only where the DRD allows it (guard matrix)', function (t) {
    var S = samples();
    t.ok(S.TWIST, 'found a Twist sample'); t.ok(S.BREAK, 'found a no-Twist break sample');
    Object.keys(ALLOWED).forEach(function (name) {
      var st = S[name];
      Object.keys(A).forEach(function (type) {
        var before = JSON.stringify(st);
        var out = act(st, type, payloadFor(type, st));
        var allowed = ALLOWED[name].indexOf(type) >= 0;
        t.eq(E.canAct(st, type), allowed, 'canAct ' + type + ' in ' + name);
        if (allowed) t.ne(out, st, type + ' should change ' + name);
        else {
          t.same(out, st, type + ' should be ignored in ' + name);
          t.deepEq(out, JSON.parse(before), type + ' in ' + name + ' deep-equal');
        }
        t.eq(JSON.stringify(st), before, type + ' must not mutate ' + name);
      });
    });
  });

  add('garbage actions and states never throw and change nothing', function (t) {
    var s = start({}, 1);
    [null, undefined, 1, 'READY', {}, { type: 'NOPE' }, { type: 42 }, []].forEach(function (a) {
      t.same(E.reduce(s, a, FX, mulberry32(1)), s, show(a));
    });
    [null, undefined, {}, { phase: 'RELAY_TURN' }, 'x'].forEach(function (bad) {
      Object.keys(A).forEach(function (type) {
        t.same(E.reduce(bad, { type: type }, FX, mulberry32(1)), bad, type + ' on ' + show(bad));
      });
      E.getView(bad, FX);
    });
    t.eq(E.getView(null, FX).screen, 'setup');
    // Missing content mid-game: unchanged, no throw.
    var r = act(s, A.READY);
    E.reduce(r, { type: A.CONTINUE_UNRECORDED }, null, mulberry32(1));
    E.getView(r, null);
  });

  add('immutability: frozen inputs are never written to', function (t) {
    var S = samples();
    Object.keys(ALLOWED).forEach(function (name) {
      var st = deepFreeze(clone(S[name]));
      ALLOWED[name].forEach(function (type) {
        var out = act(st, type, payloadFor(type, st));
        // If the engine had tried to write to a frozen object, reduce would have returned st.
        t.ne(out, st, type + ' on frozen ' + name);
      });
    });
    var fx = deepFreeze(makeFixture());
    var g = playGame(fx, cfg({ level: 'weaver' }), mulberry32(3), mulberry32(4), { softenRate: 1, recordRate: 0.3, replaceRate: 0.2 });
    t.eq(g.state.phase, 'FATE_CHOICE', 'full game on frozen content');
  });

  add('a bad rng (1, NaN, throws, missing) never breaks the rules', function (t) {
    var rngs = [function () { return 1; }, function () { return NaN; }, function () { throw new Error('x'); }, null, function () { return -5; }];
    rngs.forEach(function (rng, i) {
      var s = E.createSession(cfg({ level: 'weaver' }), FX, rng);
      t.eq(s.phase, 'RELAY_TURN', 'rng ' + i);
      var guard = 0;
      while (s.phase !== 'FATE_CHOICE' && guard++ < 200) {
        if (s.phase === 'ROUND_BREAK') s = E.reduce(s, { type: A.CONTINUE_AFTER_BREAK }, FX, rng);
        else s = E.reduce(E.reduce(s, { type: A.READY }, FX, rng), { type: A.CONTINUE_UNRECORDED }, FX, rng);
      }
      t.eq(s.phase, 'FATE_CHOICE', 'rng ' + i + ' reaches the Fates');
      t.ok(s.twistIds.length >= 1, 'guaranteed Twist still happens');
    });
  });

  // ------------------------------------------------------------- tests: turn flow and timer

  add('READY starts the countdown; TICK before READY, while paused or saving is ignored', function (t) {
    var h = start({}, 1);
    t.same(act(h, A.TICK), h, 'TICK in hand-over');
    var r = act(h, A.READY);
    t.eq(r.turnState, 'TURN_READY'); t.eq(r.secondsLeft, 30);
    var r1 = act(r, A.TICK);
    t.eq(r1.secondsLeft, 29); t.eq(r1.overtime, false);
    var p = act(r1, A.PAUSE);
    t.same(act(p, A.TICK), p, 'TICK while paused');
    var back = act(p, A.RESUME);
    t.eq(back.secondsLeft, 29); t.eq(back.paused, false); t.eq(back.promptId, r1.promptId, 'same prompt after Resume');
    var rec = act(back, A.RECORD_STARTED);
    var rt = act(rec, A.TICK);
    t.eq(rt.secondsLeft, 28, 'the countdown keeps going while recording (decision 2026-10-29)');
    t.eq(E.getView(rt, FX).timer.running, true, 'timer bar runs while recording');
    var sv = act(rec, A.RECORD_STOPPED);
    t.same(act(sv, A.TICK), sv, 'TICK while saving');
  });

  add('storyStage: begin, middle, end, twist (first turn after a Twist), final (last turn)', function (t) {
    var s = { round: 1, maxRounds: 4, playerIndex: 0, playerCount: 3, pinnedTwist: null };
    function at(o) { var x = {}; for (var k in s) x[k] = s[k]; for (k in o) x[k] = o[k]; return E.storyStage(x); }
    t.eq(at({}), 'begin');
    t.eq(at({ round: 2, playerIndex: 2 }), 'middle');
    t.eq(at({ round: 4 }), 'end');
    t.eq(at({ round: 4, playerIndex: 2 }), 'final');
    t.eq(at({ round: 3, pinnedTwist: { round: 2 } }), 'twist');
    t.eq(at({ round: 3, playerIndex: 1, pinnedTwist: { round: 2 } }), 'middle', 'only the first turn after it');
    t.eq(E.fillPrompt('How do you {quest}?', { questGoal: 'find the hamster' }), 'How do you find the hamster?');
  });

  add('recordLimitSeconds: time left + 15 s grace, between 20 and 60 s', function (t) {
    var s = act(start({}, 1), A.READY);
    t.eq(E.recordLimitSeconds(s), 45, 'Sprout, full 30 s left');
    for (var i = 0; i < 30; i++) s = act(s, A.TICK);
    t.eq(E.recordLimitSeconds(s), 20, 'overtime: still 20 s to finish the thought');
    t.eq(E.recordLimitSeconds(act(start({ level: 'weaver' }, 1), A.READY)), 60, 'Weaver 45 + 15 = 60, the cap');
    t.eq(E.recordLimitSeconds(null), 20, 'no state');
  });

  add('timer reaches 0: overtime, the turn never ends by itself', function (t) {
    var s = act(start({}, 1), A.READY);
    for (var i = 0; i < 29; i++) s = act(s, A.TICK);
    t.eq(s.secondsLeft, 1); t.eq(s.overtime, false);
    s = act(s, A.TICK);
    t.eq(s.secondsLeft, 0); t.eq(s.overtime, true); t.eq(s.turnState, 'TURN_READY'); t.eq(s.playerIndex, 0);
    t.same(act(s, A.TICK), s, 'TICK at 0 changes nothing');
    var v = E.getView(s, FX);
    t.eq(v.overtime, true); t.eq(v.timer.overtime, true); t.eq(v.timer.running, false); t.eq(v.screen, 'turn');
    var n = act(s, A.CONTINUE_UNRECORDED);
    t.eq(n.playerIndex, 1); t.eq(n.secondsLeft, 30, 'next turn resets'); t.eq(n.overtime, false);
  });

  add('turns advance through players, round breaks and to the Fates; turn ids and indexes', function (t) {
    var s = start({ playerCount: 3 }, 9);
    t.eq(E.getView(s, FX).isFirstTurn, true);
    s = chain(s, [A.READY, A.CONTINUE_UNRECORDED]);
    t.eq(s.playerIndex, 1); t.eq(s.turnIndex, 2); t.eq(s.turnState, 'TURN_HANDOVER');
    s = chain(s, [A.READY, A.CONTINUE_UNRECORDED, A.READY, A.CONTINUE_UNRECORDED]);
    t.eq(s.phase, 'ROUND_BREAK'); t.eq(s.breakState, 'NEXT_ROUND', 'never a Twist after round 1');
    t.eq(s.completedRounds, 1); t.eq(s.turnState, null);
    t.deepEq(s.turns.map(function (x) { return x.turnId; }), [s.sessionId + '-r1-p0', s.sessionId + '-r1-p1', s.sessionId + '-r1-p2']);
    s = act(s, A.CONTINUE_AFTER_BREAK);
    t.eq(s.round, 2); t.eq(s.playerIndex, 0); t.eq(s.turnIndex, 4); t.eq(s.turnState, 'TURN_HANDOVER');
    while (s.phase !== 'FATE_CHOICE') s = s.phase === 'ROUND_BREAK' ? act(s, A.CONTINUE_AFTER_BREAK) : finishRound(s);
    t.eq(s.turns.length, 12); t.eq(s.completedRounds, 4); t.eq(s.pinnedTwist, null);
    t.deepEq(s.turns.map(function (x) { return x.turnIndex; }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  add('PASS from hand-over and from the turn: logged as passed, unlimited, Relay moves on', function (t) {
    var s = start({ playerCount: 2, nicknames: ['Maya', 'Sam'] }, 4);
    var a = act(s, A.PASS);
    t.eq(a.playerIndex, 1); t.eq(a.turns[0].inputMethod, 'passed'); t.eq(a.turnState, 'TURN_HANDOVER');
    var v = E.getView(a, FX);
    t.eq(v.previousTurn.inputMethod, 'passed'); t.ok(v.player.label.indexOf('Sam') === 0, 'next player is Sam');
    var b = act(act(a, A.READY), A.PASS);
    t.eq(b.phase, 'ROUND_BREAK'); t.eq(b.turns[1].inputMethod, 'passed');
    // Pass every turn of the game.
    var g = playGame(FX, cfg({ playerCount: 6 }), mulberry32(2), mulberry32(3), { passRate: 1 });
    t.eq(g.state.phase, 'FATE_CHOICE');
    t.eq(g.state.turns.length, 24);
    var gv = E.getView(g.state, FX);
    t.eq(gv.counts.turnsTold, 0); t.eq(gv.counts.passes, 24);
  });

  add('recording: start, stop, save logs a microphone turn; auto-stop notice; wrong turnId ignored', function (t) {
    var s = act(start({}, 1), A.READY);
    var rec = act(s, A.RECORD_STARTED);
    t.eq(rec.turnState, 'TURN_RECORDING'); t.eq(E.getView(rec, FX).screen, 'recording');
    t.same(act(rec, A.CONTINUE_UNRECORDED), rec, 'cannot leave the turn while recording');
    var sv = act(rec, A.RECORD_STOPPED, { autoStop: true });
    t.eq(sv.turnState, 'TURN_SAVING'); t.eq(E.getView(sv, FX).screen, 'saving');
    t.same(act(sv, A.RECORD_SAVED, { turnId: 'someone-else', byteSize: 5 }), sv, 'wrong turnId');
    var done = act(sv, A.RECORD_SAVED, { turnId: E.getView(sv, FX).currentTurnId, durationSeconds: 12.5, mimeType: 'audio/webm;codecs=opus', byteSize: 4096 });
    t.eq(done.playerIndex, 1); t.eq(done.notice, 'auto-stop');
    t.deepEq([done.turns[0].inputMethod, done.turns[0].durationSeconds, done.turns[0].mimeType, done.turns[0].byteSize],
      ['microphone', 12.5, 'audio/webm;codecs=opus', 4096]);
    t.eq(act(done, A.READY).notice, null, 'notice cleared on READY');
    // RECORD_SAVED straight from TURN_RECORDING (DRD allows both); empty blob = unrecorded.
    var direct = act(rec, A.RECORD_SAVED, { durationSeconds: 1, byteSize: 0 });
    t.eq(direct.turns[0].inputMethod, 'verbal-unrecorded'); t.eq(direct.notice, null);
  });

  add('RECORD_FAILED: denied blocks the mic for the story; quota and disconnect keep the turn', function (t) {
    var r = act(start({ playerCount: 2 }, 1), A.READY);
    var d = act(r, A.RECORD_FAILED, { reason: 'denied' });
    t.eq(d.micBlocked, true); t.eq(d.turnState, 'TURN_READY'); t.eq(d.notice, 'mic-blocked');
    t.eq(E.getView(d, FX).recordOffered, false);
    t.same(act(d, A.RECORD_STARTED), d, 'no Record after denied');
    var later = chain(d, [A.CONTINUE_UNRECORDED, A.READY, A.CONTINUE_UNRECORDED, A.CONTINUE_AFTER_BREAK, A.READY]);
    t.eq(later.micBlocked, true); t.same(act(later, A.RECORD_STARTED), later, 'still blocked next round');
    t.eq(later.notice, null, 'mic-blocked note shown once');

    var u = act(r, A.RECORD_FAILED, { reason: 'unsupported' });
    t.eq(u.recordUnavailable, true); t.eq(u.notice, 'mic-missing'); t.eq(E.getView(u, FX).recordOffered, false);

    var rec = act(r, A.RECORD_STARTED);
    var q = act(act(rec, A.RECORD_STOPPED), A.RECORD_FAILED, { reason: 'quota' });
    t.eq(q.playerIndex, 1); t.eq(q.turns[0].inputMethod, 'verbal-unrecorded'); t.eq(q.storageFull, true);
    t.eq(q.notice, 'storage-full');
    var qr = act(q, A.READY);
    t.same(act(qr, A.RECORD_STARTED), qr, 'Record not offered after quota');

    var dc = act(rec, A.RECORD_FAILED, { reason: 'disconnected' });
    t.eq(dc.turns[0].inputMethod, 'verbal-unrecorded'); t.eq(dc.notice, 'mic-stopped'); t.eq(dc.micBlocked, false);
    t.same(act(r, A.RECORD_FAILED, { reason: 'banana' }), r, 'unknown reason');
    // "cancelled" (Stop/Pause while the permission prompt is open): back to the turn, mic not blocked.
    var c1 = act(rec, A.RECORD_FAILED, { reason: 'cancelled' });
    t.eq(c1.turnState, 'TURN_READY'); t.eq(c1.micBlocked, false); t.eq(c1.turns.length, 0); t.eq(c1.promptId, rec.promptId);
    t.eq(act(c1, A.RECORD_STARTED).turnState, 'TURN_RECORDING', 'Record still offered');
    var c2 = act(act(rec, A.PAUSE), A.RECORD_FAILED, { reason: 'cancelled' });
    t.eq(c2.turnState, 'TURN_READY'); t.eq(c2.paused, true);
    t.same(act(r, A.RECORD_FAILED, { reason: 'cancelled' }), r, 'cancelled outside a recording: nothing to do');
    t.same(act(r, A.RECORD_FAILED, {}), r, 'missing reason');
  });

  add('Pause: stops the timer, stops a recording; turn resumes or moves on after saving', function (t) {
    var r = act(act(start({}, 1), A.READY), A.TICK);
    var p = act(r, A.PAUSE);
    t.eq(p.paused, true); t.eq(E.getView(p, FX).timer.running, false);
    ['TICK', 'CONTINUE_UNRECORDED', 'REPLACE_PROMPT', 'PASS', 'RECORD_STARTED', 'PAUSE'].forEach(function (x) {
      t.same(act(p, x), p, x + ' while paused');
    });
    var back = act(p, A.RESUME);
    t.deepEq(back, r, 'Resume returns to the same turn, prompt and time');
    var rec = act(r, A.RECORD_STARTED);
    var pr = act(rec, A.PAUSE);
    t.eq(pr.paused, true); t.eq(pr.turnState, 'TURN_SAVING', 'Pause stops the recording');
    var saved = act(pr, A.RECORD_SAVED, { byteSize: 100, durationSeconds: 2, mimeType: 'audio/mp4' });
    t.eq(saved.playerIndex, 1); t.eq(saved.turnState, 'TURN_HANDOVER'); t.eq(saved.paused, true, 'still paused');
    t.eq(saved.turns[0].inputMethod, 'microphone');
    t.same(act(saved, A.READY), saved, 'READY while paused');
    var go = act(saved, A.RESUME);
    t.eq(go.paused, false); t.eq(go.turnState, 'TURN_HANDOVER');
  });

  add('REPLACE_PROMPT never returns the current or the last 4 shown; timer and turn unchanged', function (t) {
    for (var seed = 1; seed <= 300; seed++) {
      var s = act(start({ level: seed % 2 ? 'sprout' : 'weaver' }, seed), A.READY);
      s = chain(s, [A.TICK, A.TICK]);
      for (var k = 0; k < 6; k++) {
        var before = s;
        var hist = before.promptHistory.slice(-5);
        s = act(s, A.REPLACE_PROMPT, null, FX, mulberry32(seed * 31 + k));
        t.ne(s.promptId, before.promptId, 'replace gives a new prompt');
        t.ok(hist.indexOf(s.promptId) < 0, 'not current or last 4: ' + s.promptId + ' in ' + hist.join(','));
        t.eq(s.secondsLeft, before.secondsLeft, 'timer continues'); t.eq(s.turnIndex, before.turnIndex);
        t.eq(s.turnState, 'TURN_READY');
      }
    }
    // A pool of one prompt: Replace has nothing to offer, state unchanged.
    var tiny = makeFixture(); tiny.prompts = [tiny.prompts[0]];
    var one = act(E.createSession(cfg({}), tiny, mulberry32(1)), A.READY, null, tiny);
    t.same(act(one, A.REPLACE_PROMPT, null, tiny), one);
  });

  add('prompt draw: level pool only, never one of the last 4 shown at a new turn', function (t) {
    ['sprout', 'weaver'].forEach(function (level) {
      for (var seed = 1; seed <= 200; seed++) {
        playGame(FX, cfg({ level: level, playerCount: 2 + (seed % 5) }), mulberry32(seed), mulberry32(seed + 1000), {
          replaceRate: 0.3, passRate: 0.1,
          onStep: function (prev, a, next) {
            if (next.turnState === 'TURN_HANDOVER' && next.promptId && next !== prev && next.turnIndex !== prev.turnIndex) {
              var hist = next.promptHistory.slice(0, -1).slice(-4);
              t.ok(hist.indexOf(next.promptId) < 0, 'repeat within 4: ' + next.promptId);
              t.ok(next.promptId.indexOf(level + '-') === 0 || next.promptId.indexOf('all-') === 0, 'pool ' + next.promptId);
            }
          }
        });
      }
    });
  });

  // ------------------------------------------------------------- tests: Twists

  function twistSim(content, level, players, games, seed, worldPick) {
    var r = mulberry32(seed);
    var d = mulberry32(seed ^ 0x9E3779B9);
    var stats = { games: 0, twoTwists: 0, sproutR2: 0, firstAtR2: 0, softened: 0 };
    for (var g = 0; g < games; g++) {
      var c = worldPick(g, level);
      c.level = level; c.playerCount = players;
      var breaks = 0;
      var res = playGame(content, c, r, d, {
        softenRate: 0.25, passRate: 0.05,
        onStep: function (prev, a, next) {
          if (a.type === 'SOFTEN_TWIST') {
            if (next.twistIds.length !== prev.twistIds.length) fail('soften caused a draw');
            if (E.canAct(next, 'SOFTEN_TWIST')) fail('soften offered twice');
          }
          if (next.phase === 'ROUND_BREAK' && prev.phase !== 'ROUND_BREAK') {
            breaks++;
            if (next.twistIds.length - prev.twistIds.length > 1) fail('more than one Twist at a break');
          }
        }
      });
      var s = res.state;
      var log = s.twistLog;
      var rounds = log.map(function (e) { return e.round; });
      var ids = s.twistIds;
      if (ids.length !== log.length) fail('twistIds and twistLog disagree');
      if (ids.some(function (id, i) { return ids.indexOf(id) !== i; })) fail('repeated Twist ' + ids.join(','));
      if (rounds.some(function (x, i) { return rounds.indexOf(x) !== i; })) fail('two Twists in one break');
      var world = c.builtWorld ? E.buildWorld(c.builtWorld, content) : null;
      var pool = (world ? world.twists : content.worlds.filter(function (w) { return w.id === c.worldId; })[0].twists)
        .map(function (x) { return x.id; });
      ids.forEach(function (id) { if (pool.indexOf(id) < 0) fail('Twist ' + id + ' not from the world pool'); });
      if (level === 'sprout') {
        if (ids.length !== 1) fail('Sprout needs exactly 1 Twist, got ' + ids.length);
        if (rounds[0] !== 2 && rounds[0] !== 3) fail('Sprout Twist at end of round ' + rounds[0]);
        if (rounds[0] === 2) stats.sproutR2++;
      } else {
        if (ids.length < 1 || ids.length > 2) fail('Weaver needs 1-2 Twists, got ' + ids.length);
        rounds.forEach(function (x) { if (x < 2 || x > 4) fail('Weaver Twist at end of round ' + x); });
        if (rounds[0] > 3) fail('Weaver first Twist after round 3');
        if (ids.length === 2) stats.twoTwists++;
        if (rounds[0] === 2) stats.firstAtR2++;
      }
      if (breaks !== s.maxRounds - 1) fail('expected ' + (s.maxRounds - 1) + ' round breaks, got ' + breaks);
      if (s.softenedTwistIds.some(function (id) { return ids.indexOf(id) < 0; })) fail('softened id not a drawn Twist');
      stats.softened += s.softenedTwistIds.length;
      stats.games++;
    }
    return stats;
  }

  function fixtureWorldPick(g, level) {
    var k = g % 3;
    if (k === 0) return { worldId: 'w-one', useCharacters: true };
    if (k === 1) return { worldId: 'w-two', useCharacters: false };
    return { builtWorld: { where: level === 'weaver' && g % 2 ? 'spooky-house' : 'museum', when: 'today', kind: 'mystery', mission: 'find-lost' } };
  }

  [2, 3, 4, 5, 6].forEach(function (n) {
    var label = SIM_GAMES.toLocaleString('en-US') + ' seeded games' + (QUICK ? ' (quick mode)' : '');
    add('Twist simulation: Story Sprout, ' + n + ' players, ' + label, function (t) {
      var st = twistSim(FX, 'sprout', n, SIM_GAMES, 1000 + n, fixtureWorldPick);
      t.eq(st.games, SIM_GAMES);
      t.near(st.sproutR2 / st.games, 0.5, simTolerance(0.5, SIM_GAMES), 'about half at end of round 2');
    });
    add('Twist simulation: Tale Weaver, ' + n + ' players, ' + label, function (t) {
      var st = twistSim(FX, 'weaver', n, SIM_GAMES, 2000 + n, fixtureWorldPick);
      t.eq(st.games, SIM_GAMES);
      // P(2 Twists) = 0.5 * 0.75 + 0.5 * 0.5 = 0.625 with every non-guaranteed chance at 0.50.
      t.near(st.twoTwists / st.games, 0.625, simTolerance(0.625, SIM_GAMES), 'share of games with 2 Twists');
      t.near(st.firstAtR2 / st.games, 0.5, simTolerance(0.5, SIM_GAMES), 'first Twist at end of round 2');
    });
  });

  add('twistChance table matches DRD §5.2', function (t) {
    var c = E.twistChance;
    t.deepEq([c('sprout', 1, 0), c('sprout', 2, 0), c('sprout', 3, 0), c('sprout', 4, 0), c('sprout', 2, 1), c('sprout', 3, 1)], [0, 0.5, 1, 0, 0, 0]);
    t.deepEq([c('weaver', 1, 0), c('weaver', 2, 0), c('weaver', 3, 0), c('weaver', 3, 1), c('weaver', 4, 1), c('weaver', 5, 1), c('weaver', 4, 2), c('weaver', 3, 2)],
      [0, 0.5, 1, 0.5, 0.5, 0, 0, 0]);
  });

  add('level rules come from content.levels (rounds, seconds, windows, limits)', function (t) {
    var fx = makeFixture();
    fx.levels.sprout = { id: 'sprout', maxRounds: 3, turnSeconds: 20, twistWindows: [2], minTwists: 1, maxTwists: 1 };
    fx.levels.weaver = { id: 'weaver', maxRounds: 6, turnSeconds: 60, twistWindows: [2, 3, 4, 5], minTwists: 1, maxTwists: 3 };
    var s = E.createSession(cfg({}), fx, mulberry32(1));
    t.eq(s.maxRounds, 3); t.eq(s.turnSeconds, 20); t.eq(s.secondsLeft, 20);
    t.deepEq(s.twistRules, { maxRounds: 3, twistWindows: [2], minTwists: 1, maxTwists: 1 }, 'rules saved in the state');
    // Window [2] only: round 2 is the last window, so the Twist is guaranteed there.
    for (var seed = 1; seed <= 300; seed++) {
      var g = playGame(fx, cfg({}), mulberry32(seed), mulberry32(seed + 1)).state;
      t.eq(g.turns.length, 9); t.deepEq(g.twistLog.map(function (e) { return e.round; }), [2]);
      var w = playGame(fx, cfg({ level: 'weaver', worldId: 'w-two' }), mulberry32(seed), mulberry32(seed + 1)).state;
      t.eq(w.completedRounds, 6);
      var rounds = w.twistLog.map(function (e) { return e.round; });
      t.ok(rounds.length >= 1 && rounds.length <= 3 && rounds[0] <= 3, 'custom weaver ' + rounds.join(','));
      rounds.forEach(function (r) { t.ok(r >= 2 && r <= 5); });
    }
    // Missing level fields fall back to DRD §2.3 values.
    var bare = makeFixture(); bare.levels = { sprout: {}, weaver: {} };
    var b = E.createSession(cfg({ level: 'weaver' }), bare, mulberry32(1));
    t.eq(b.maxRounds, 5); t.eq(b.turnSeconds, 45); t.deepEq(b.twistRules.twistWindows, [2, 3, 4]);
    // twistChance with a rules object.
    t.eq(E.twistChance(fx.levels.weaver, 5, 2), 0.5); t.eq(E.twistChance(fx.levels.weaver, 6, 0), 0, 'never at the last round');
    t.eq(E.twistChance(fx.levels.weaver, 3, 3), 0, 'max reached');
  });

  add('buildWorld reads the four template keys from content.builder', function (t) {
    var fx = makeFixture();
    fx.builder.worldTitleTemplate = 'T:{where.label}/{when.label}';
    fx.builder.worldTemplate = 'W:{where.phrase}|{when.phrase}|{kind.phrase}';
    fx.builder.questTitleTemplate = 'QT:{mission.questTitle}';
    fx.builder.questTemplate = 'Q:{mission.questText}';
    var w = E.buildWorld(BUILT, fx);
    t.eq(w.title, 'T:Museum/The Future'); t.eq(w.world, 'W:A museum|in the future|A mystery story.');
    t.eq(w.questTitle, 'QT:Lost and found'); t.eq(w.quest, 'Q:Something special is lost. Find it and bring it back.');
  });

  function toTwist(level, world, seedFrom) {
    for (var seed = seedFrom || 1; seed < 500; seed++) {
      var over = { level: level };
      if (world === 'built') over.builtWorld = BUILT; else over.worldId = world;
      var s = start(over, seed);
      for (var guard = 0; guard < 10 && s.phase !== 'FATE_CHOICE'; guard++) {
        s = finishRound(s);
        if (s.breakState === 'TWIST_REVEAL') return s;
        if (s.phase === 'ROUND_BREAK') s = act(s, A.CONTINUE_AFTER_BREAK);
      }
    }
    return null;
  }

  add('Soften Twist: swaps to the world softenTwist, counts as the Twist, once per Twist', function (t) {
    var s = toTwist('sprout', 'w-one');
    var v = E.getView(s, FX);
    t.eq(v.screen, 'twist'); t.ok(v.twist && !v.twist.softened && v.twist.canSoften);
    t.ok(/one twist \d S/.test(v.twist.text), 'Sprout text');
    var soft = act(s, A.SOFTEN_TWIST);
    var sv = E.getView(soft, FX);
    t.eq(sv.twist.id, 'one-soft'); t.eq(sv.twist.text, 'one soft S'); t.eq(sv.twist.softened, true); t.eq(sv.twist.canSoften, false);
    t.deepEq(soft.softenedTwistIds, [s.pinnedTwist.twistId]); t.eq(soft.twistIds.length, 1, 'still one Twist');
    t.eq(sv.counts.twists, 1); t.eq(sv.counts.softened, 1);
    t.same(act(soft, A.SOFTEN_TWIST), soft, 'once per Twist');
    // Still pinned (softened) on the next turns, and not soften-able again.
    var turn = act(soft, A.CONTINUE_AFTER_BREAK);
    t.eq(E.getView(turn, FX).twist.id, 'one-soft'); t.same(act(turn, A.SOFTEN_TWIST), turn);
  });

  add('Soften while the Twist is pinned during the next round; level fallback text', function (t) {
    var s = toTwist('weaver', 'w-two');
    var turn = act(s, A.CONTINUE_AFTER_BREAK);
    var v = E.getView(turn, FX);
    t.eq(v.twist.fresh, true, 'hand-over of the first turn after the reveal');
    t.ok(/two twist \d W/.test(v.twist.text), 'Weaver text');
    var ready = act(turn, A.READY);
    t.eq(E.getView(ready, FX).twist.fresh, true, 'first turn after the reveal shows the full Twist');
    var softened = act(ready, A.SOFTEN_TWIST);
    var sv = E.getView(softened, FX);
    t.eq(sv.twist.id, 'two-soft'); t.eq(sv.twist.text, 'two soft S', 'missing Weaver text falls back to Sprout');
    t.eq(softened.turnState, 'TURN_READY'); t.eq(softened.secondsLeft, ready.secondsLeft);
    var next = chain(softened, [A.CONTINUE_UNRECORDED]);
    t.eq(E.getView(next, FX).twist.fresh, false, 'later turns: collapsed');
  });

  add('pinned Twist is cleared at the next round break; Soften there is invalid', function (t) {
    var s = toTwist('sprout', 'w-one');
    s = finishRound(act(s, A.CONTINUE_AFTER_BREAK));
    t.eq(s.phase, 'ROUND_BREAK'); t.eq(s.breakState, 'NEXT_ROUND', 'Sprout: only one Twist');
    t.eq(s.pinnedTwist, null); t.eq(E.getView(s, FX).twist, null);
    t.same(act(s, A.SOFTEN_TWIST), s);
  });

  add('built world: any-world Twists, an unused any-world Soften Twist, any-world Fates, spark', function (t) {
    var softSeen = {};
    for (var seed = 1; seed <= 40; seed++) {
      var s = toTwist('weaver', 'built', seed);
      t.ok(/^any-t/.test(s.pinnedTwist.twistId));
      var soft = act(s, A.SOFTEN_TWIST, null, FX, mulberry32(seed));
      t.ok(/^any-soft[12]$/.test(soft.pinnedTwist.softenId)); softSeen[soft.pinnedTwist.softenId] = true;
      // Second Twist (if any) softened: must pick the other, unused soften Twist.
      var g = finishRound(act(soft, A.CONTINUE_AFTER_BREAK));
      while (g.phase === 'ROUND_BREAK' && g.breakState !== 'TWIST_REVEAL') g = finishRound(act(g, A.CONTINUE_AFTER_BREAK));
      if (g.breakState === 'TWIST_REVEAL') {
        var g2 = act(g, A.SOFTEN_TWIST, null, FX, mulberry32(seed + 5));
        t.ne(g2.pinnedTwist.softenId, soft.pinnedTwist.softenId, 'unused soften Twist');
        t.eq(g2.softenIds.length, 2);
      }
    }
    t.ok(softSeen['any-soft1'] && softSeen['any-soft2'], 'both any-world soften Twists can appear');
    var b = start({ builtWorld: BUILT }, 3);
    var spark = E.getView(act(b, A.READY), FX).spark;
    t.ok(spark === 'Any spark one?' || spark === 'Any spark two?', 'any-world spark');
  });

  // ------------------------------------------------------------- tests: Fates, epilogue, restart, abandon

  add('Fates: exactly 3, in order solved / changed / to-be-continued, level text and closer', function (t) {
    var S = samples();
    var v = E.getView(S.FATE, FX);
    t.eq(v.screen, 'fate');
    t.deepEq(v.fates.map(function (f) { return f.type; }), ['solved', 'changed', 'to-be-continued']);
    t.deepEq(v.fates.map(function (f) { return f.text; }), ['one solved S', 'one changed S', 'one continued S']);
    t.deepEq(v.fates.map(function (f) { return f.closer; }), ['Best part?', null, 'Where next?']);
    t.same(act(S.FATE, A.CHOOSE_FATE, { fateId: 'two-f-solved' }), S.FATE, "another world's Fate");
    t.same(act(S.FATE, A.CHOOSE_FATE, { fateId: 'any-f-solved' }), S.FATE, 'any-world Fate on a ready-made world');
    t.same(act(S.FATE, A.CHOOSE_FATE, {}), S.FATE, 'missing fateId');
    var e = act(S.FATE, A.CHOOSE_FATE, { fateId: 'one-f-continued' });
    var ev = E.getView(e, FX);
    t.eq(e.status, 'completed'); t.eq(ev.screen, 'epilogue'); t.eq(ev.chosenFate.id, 'one-f-continued');
    t.eq(ev.chosenFate.closer, 'Where next?');
    var wv = playGame(FX, cfg({ level: 'weaver', builtWorld: BUILT }), mulberry32(8), mulberry32(9)).state;
    var wf = E.getView(wv, FX).fates;
    t.deepEq(wf.map(function (f) { return f.id; }), ['any-f-solved', 'any-f-changed', 'any-f-continued']);
    t.eq(wf[0].text, 'any solved W');
    t.eq(act(wv, A.CHOOSE_FATE, { fateId: 'any-f-changed' }).phase, 'EPILOGUE');
  });

  add('epilogue view: album rows, counts (turns told excludes passes), Twists', function (t) {
    var g = playGame(FX, cfg({ playerCount: 3, nicknames: ['Maya'] }), mulberry32(11), mulberry32(12), { passRate: 0.3, recordRate: 0.4 });
    var e = act(g.state, A.CHOOSE_FATE, { fateId: 'one-f-solved' });
    var v = E.getView(e, FX);
    t.eq(v.album.length, 12);
    var passes = e.turns.filter(function (x) { return x.inputMethod === 'passed'; }).length;
    t.ok(passes > 0, 'the seed has passes');
    t.eq(v.counts.turnsTold, 12 - passes); t.eq(v.counts.twists, 1);
    v.album.forEach(function (row, i) {
      t.eq(row.turnIndex, i + 1);
      t.ok(row.promptText.length > 0, 'prompt text');
      t.ok(['microphone', 'verbal-unrecorded', 'passed'].indexOf(row.inputMethod) >= 0);
      t.eq(row.hasAudio, row.inputMethod === 'microphone');
      t.eq(row.label, E.labelFor(e, row.playerIndex, FX));
    });
    t.ok(v.album[0].label.indexOf('Maya · Character ') === 0, 'nickname and character');
    t.ok(v.counts.recorded > 0);
    var gone = E.getView(E.withoutNicknames(e), FX);
    t.ok(gone.album[0].label.indexOf('Character ') === 0, 'after Delete: character name');
  });

  add('actionForClip maps every recorder + storage result to the right action', function (t) {
    var ok = { ok: true, blob: { size: 1200 }, mimeType: 'audio/webm', durationSeconds: 7, cause: 'manual' };
    t.deepEq(E.actionForClip(ok, { ok: true }, 'x1'),
      { type: A.RECORD_SAVED, turnId: 'x1', durationSeconds: 7, mimeType: 'audio/webm', byteSize: 1200 });
    t.deepEq(E.actionForClip(ok, { ok: true, audioDropped: true, reason: 'quota' }, 'x1'), { type: A.RECORD_FAILED, reason: 'quota' });
    t.deepEq(E.actionForClip(ok, { ok: false, reason: 'quota' }, 'x1'), { type: A.RECORD_FAILED, reason: 'quota' });
    t.deepEq(E.actionForClip(ok, { ok: false, reason: 'error' }, 'x1'),
      { type: A.RECORD_SAVED, turnId: 'x1', durationSeconds: 7, byteSize: 0 }, 'save error: told out loud');
    t.deepEq(E.actionForClip({ ok: false, reason: 'empty', cause: 'disconnect', durationSeconds: 2 }, null, 'x1'),
      { type: A.RECORD_FAILED, reason: 'disconnected' });
    t.deepEq(E.actionForClip({ ok: false, reason: 'empty', cause: 'manual', durationSeconds: 2 }, null, 'x1'),
      { type: A.RECORD_SAVED, turnId: 'x1', durationSeconds: 2, byteSize: 0 });
    t.deepEq(E.actionForClip(null, null, 'x1'), { type: A.RECORD_SAVED, turnId: 'x1', durationSeconds: 0, byteSize: 0 });
  });

  add('RESTART goes back to Setup with level, players, characters and names kept', function (t) {
    var S = samples();
    var ep = S.EPILOGUE;
    var s = act(ep, A.RESTART);
    t.eq(s.phase, 'SETUP'); t.eq(s.status, 'completed'); t.eq(s.sessionId, ep.sessionId);
    t.deepEq(s.setup, { level: 'sprout', playerCount: 3, useCharacters: true, nicknames: [null, null, null] });
    var v = E.getView(s, FX);
    t.eq(v.screen, 'setup'); t.eq(v.lastStatus, 'completed');
    var again = act(s, A.START, { config: cfg({ worldId: 'w-two' }) }, FX, mulberry32(99));
    t.eq(again.phase, 'RELAY_TURN'); t.ne(again.sessionId, ep.sessionId); t.eq(again.turns.length, 0);
    t.eq(again.status, 'active');
  });

  add('ABANDON from a turn, a round break or the Fates: Setup, status abandoned, turns kept', function (t) {
    var S = samples();
    ['HANDOVER', 'READY', 'SAVING', 'PAUSED_READY', 'BREAK', 'TWIST', 'FATE'].forEach(function (k) {
      var a = act(S[k], A.ABANDON);
      t.eq(a.phase, 'SETUP', k); t.eq(a.status, 'abandoned', k); t.eq(a.sessionId, S[k].sessionId, k);
      t.eq(a.setup.playerCount, S[k].playerCount, k);
      t.eq(E.getView(a, FX).lastStatus, 'abandoned');
    });
    t.same(act(S.RECORDING, A.ABANDON), S.RECORDING, 'stop the recording first');
    t.same(act(S.SETUP, A.ABANDON), S.SETUP); t.same(act(S.EPILOGUE, A.ABANDON), S.EPILOGUE);
  });

  // ------------------------------------------------------------- tests: labels, world builder, view

  add('labels: nickname · character, nickname, character, Player N', function (t) {
    var s = start({ playerCount: 3, nicknames: ['Maya', '', 'Sam'] }, 5);
    var c0 = FX.characters.filter(function (c) { return c.id === s.characterIds[0]; })[0].name;
    t.eq(E.labelFor(s, 0, FX), 'Maya · ' + c0);
    t.ok(/^Character \d$/.test(E.labelFor(s, 1, FX)));
    var off = start({ playerCount: 3, useCharacters: false, nicknames: ['Maya'] }, 5);
    t.eq(E.labelFor(off, 0, FX), 'Maya'); t.eq(E.labelFor(off, 1, FX), 'Player 2'); t.eq(E.labelFor(off, 2, FX), 'Player 3');
    var v = E.getView(off, FX);
    t.deepEq(v.roster.map(function (p) { return p.label; }), ['Maya', 'Player 2', 'Player 3']);
    t.eq(v.roster[0].active, true); t.eq(v.player.label, 'Maya'); t.eq(v.nextPlayer.label, 'Player 2');
    t.eq(E.labelFor(null, 1, FX), 'Player 2');
  });

  add('buildWorld: card text from the templates; bad picks give null; Spooky House is Weaver-only', function (t) {
    var w = E.buildWorld(BUILT, FX);
    t.eq(w.kind, 'built'); t.eq(w.title, 'Museum · The Future');
    t.eq(w.world, 'A museum in the future. A mystery story.');
    t.eq(w.questTitle, 'Lost and found'); t.eq(w.quest, 'Something special is lost. Find it and bring it back.');
    t.eq(w.icon, 'where-museum'); t.deepEq(w.levels, ['sprout', 'weaver']);
    t.eq(w.twists, FX.anyWorld.twists); t.eq(w.fates.length, 3);
    t.deepEq(E.buildWorld({ where: 'spooky-house', when: 'today', kind: 'mystery', mission: 'find-lost' }, FX).levels, ['weaver']);
    [null, {}, { where: 'museum' }, { where: 'mars', when: 'today', kind: 'mystery', mission: 'find-lost' }].forEach(function (c) {
      t.eq(E.buildWorld(c, FX), null, show(c));
    });
    t.eq(E.buildWorld(BUILT, null), null);
    var notpl = makeFixture(); delete notpl.builder.worldTemplate; delete notpl.builder.worldTitleTemplate;
    t.eq(E.buildWorld(BUILT, notpl).world, 'A museum in the future. A mystery story.', 'default template');
    var s = start({ builtWorld: BUILT }, 2);
    t.eq(E.getView(s, FX).world.title, 'Museum · The Future'); t.eq(s.worldId, null);
  });

  add('view: prompt hidden on hand-over, spark on Round 1 Turn 1 only, round x of max', function (t) {
    var h = start({ playerCount: 2 }, 1);
    var hv = E.getView(h, FX);
    t.eq(hv.screen, 'handover'); t.eq(hv.prompt, null); t.eq(hv.showPrompt, false); t.eq(hv.spark, null);
    t.eq(hv.isFirstTurn, true); t.eq(hv.round, 1); t.eq(hv.maxRounds, 4); t.eq(hv.totalTurns, 8);
    var r = act(h, A.READY);
    var rv = E.getView(r, FX);
    t.eq(rv.screen, 'turn'); t.ok(rv.prompt && rv.prompt.text.length > 0); t.eq(rv.spark, 'What do you see first?');
    t.eq(rv.timer.running, true); t.eq(rv.timer.fraction, 1); t.eq(rv.can.REPLACE_PROMPT, true); t.eq(rv.can.RECORD_STOPPED, false);
    var n = act(act(r, A.CONTINUE_UNRECORDED), A.READY);
    t.eq(E.getView(n, FX).spark, null, 'no spark on Turn 2');
    var b = finishRound(n);
    var bv = E.getView(b, FX);
    t.eq(bv.screen, 'round-break'); t.eq(bv.roundsDone, 1); t.eq(bv.nextRoundIsLast, false);
    var r2 = act(act(b, A.CONTINUE_AFTER_BREAK), A.READY);
    t.eq(E.getView(r2, FX).spark, null, 'no spark in Round 2');
    // Break before the last round.
    var g = start({ playerCount: 2 }, 1);
    while (!(g.phase === 'ROUND_BREAK' && g.round === 3)) g = g.phase === 'ROUND_BREAK' ? act(g, A.CONTINUE_AFTER_BREAK) : finishRound(g);
    t.eq(E.getView(g, FX).nextRoundIsLast, true);
  });

  add('spark moves to the first player who tells after a Round 1 pass (decision 2026-10-23)', function (t) {
    // Player 1 passes from the hand-over: Player 2 sees the spark after I'm ready!
    var p = act(start({ playerCount: 3 }, 1), A.PASS);
    t.eq(p.playerIndex, 1);
    t.eq(E.getView(p, FX).spark, null, 'not on the hand-over');
    var r = act(p, A.READY);
    t.eq(E.getView(r, FX).spark, 'What do you see first?', 'Player 2 gets the spark');
    t.eq(E.getView(r, FX).isFirstTurn, false, 'isFirstTurn still means Round 1 Turn 1');
    // Player 2 passes from READY too: Player 3 gets it.
    var r3 = act(act(r, A.PASS), A.READY);
    t.eq(r3.playerIndex, 2);
    t.eq(E.getView(r3, FX).spark, 'What do you see first?', 'two passes: Player 3 gets the spark');
    // Player 3 tells: the spark is gone for the rest of the story.
    var told = act(r3, A.CONTINUE_UNRECORDED);
    t.eq(told.phase, 'ROUND_BREAK');
    var r2 = act(act(told, A.CONTINUE_AFTER_BREAK), A.READY);
    t.eq(E.getView(r2, FX).spark, null, 'no spark in Round 2 after a tell');
    // Player 1 tells with a recording: no spark for Player 2.
    var rec = chain(start({ playerCount: 3 }, 1), [A.READY, A.RECORD_STARTED, A.RECORD_STOPPED]);
    rec = act(rec, A.RECORD_SAVED, { turnId: E.getView(rec, FX).currentTurnId, durationSeconds: 5, byteSize: 100, mimeType: 'audio/webm' });
    t.eq(rec.playerIndex, 1, 'saved recording ends the turn');
    t.eq(E.getView(act(rec, A.READY), FX).spark, null, 'Player 1 told: no spark for Player 2');
    // Survives JSON and resumeDraft.
    t.eq(E.getView(act(E.resumeDraft(clone(r), FX), A.READY), FX).spark, 'What do you see first?', 'resumed draft keeps the moved spark');
  });

  add('spark never appears after Round 1, even when everyone passes Round 1', function (t) {
    var s = start({ playerCount: 2 }, 1);
    s = act(act(s, A.PASS), A.PASS);
    t.eq(s.phase, 'ROUND_BREAK', 'all of Round 1 passed');
    t.eq(E.getView(s, FX).spark, null, 'no spark on the round break');
    var r2 = act(act(s, A.CONTINUE_AFTER_BREAK), A.READY);
    t.eq(r2.round, 2);
    t.eq(E.getView(r2, FX).spark, null, 'no spark in Round 2 Turn 1');
    var r2b = act(act(r2, A.PASS), A.READY);
    t.eq(E.getView(r2b, FX).spark, null, 'no spark in Round 2 Turn 2');
  });

  add('test mode: ' + MODE + ' (' + SIM_GAMES + ' games per fixture Twist simulation)', function (t) {
    t.eq(SIM_GAMES, QUICK ? 500 : 10000);
    t.eq(REAL_SIM_GAMES, QUICK ? 500 : 2000);
    t.eq(simTolerance(0.5, 10000), 0.03, 'DRD tolerance kept for the full run');
    t.ok(simTolerance(0.5, 500) > 0.03, 'quick run widens the tolerance');
  });

  // ------------------------------------------------------------- tests: draft round-trip and resume

  add('state is plain JSON: round-trips at every step and replays identically', function (t) {
    var seen = 0;
    ['sprout', 'weaver'].forEach(function (level) {
      playGame(FX, cfg({ level: level, playerCount: 4, nicknames: ['Ana', 'Bo'], builtWorld: level === 'weaver' ? BUILT : undefined }),
        mulberry32(21), mulberry32(22), {
          softenRate: 0.5, recordRate: 0.3, replaceRate: 0.2, passRate: 0.1,
          onStep: function (prev, a, next) {
            var copy = clone(prev);
            t.deepEq(copy, prev, 'round-trip before ' + a.type);
            seen++;
          }
        });
    });
    t.ok(seen > 50, 'many steps checked');
    // Same seed, same game (determinism) and a restored draft continues identically.
    var a = playGame(FX, cfg({ level: 'weaver' }), mulberry32(5), mulberry32(6), { softenRate: 0.5 }).state;
    var b = playGame(FX, cfg({ level: 'weaver' }), mulberry32(5), mulberry32(6), { softenRate: 0.5 }).state;
    t.deepEq(a, b, 'deterministic with the same seed');
    var mid = chain(start({ level: 'weaver' }, 4), [A.READY, A.TICK, A.CONTINUE_UNRECORDED, A.READY]);
    var x = act(clone(mid), A.REPLACE_PROMPT, null, FX, mulberry32(77));
    var y = act(mid, A.REPLACE_PROMPT, null, FX, mulberry32(77));
    t.deepEq(x, y, 'restored draft behaves the same');
  });

  add('resumeDraft: same player hand-over, same prompt and seconds; recording drafts resume the turn', function (t) {
    var r = chain(start({ playerCount: 3 }, 6), [A.READY, A.CONTINUE_UNRECORDED, A.READY, A.TICK, A.TICK, A.PAUSE]);
    var d = E.resumeDraft(clone(r), FX);
    t.eq(d.turnState, 'TURN_HANDOVER'); t.eq(d.playerIndex, 1); t.eq(d.promptId, r.promptId);
    t.eq(d.secondsLeft, 28); t.eq(d.paused, false);
    var go = act(d, A.READY);
    t.eq(go.turnState, 'TURN_READY'); t.eq(go.secondsLeft, 28, 'countdown continues from the saved time');
    var rec = act(act(r, A.RESUME), A.RECORD_STARTED);
    var dr = E.resumeDraft(clone(rec), FX);
    t.eq(dr.turnState, 'TURN_HANDOVER'); t.eq(dr.turns.length, 1, 'the interrupted turn is not logged');
    t.eq(act(act(dr, A.READY), A.RECORD_STARTED).turnState, 'TURN_RECORDING', 'Record available again');
    var br = finishRound(start({}, 1));
    t.eq(E.resumeDraft(clone(act(br, A.PAUSE)), FX).phase, 'ROUND_BREAK');
    t.eq(E.resumeDraft(null, FX), null); t.eq(E.resumeDraft({ v: 99 }, FX), null);
    t.eq(E.resumeDraft(E.createSession({}, FX, mulberry32(1)), FX), null, 'nothing to resume in Setup');
    var gone = clone(r); gone.worldId = 'deleted-world';
    t.eq(E.resumeDraft(gone, FX), null, 'world missing from content');
    var noPrompt = clone(r); noPrompt.promptId = 'gone';
    t.eq(E.resumeDraft(noPrompt, FX), null, 'prompt missing from content');
  });

  // ------------------------------------------------------------- property tests against the real content

  // Content checks (web/js/tests-content.js), looked up at run time so load order doesn't matter.
  addGroup('content', function (check) {
    if (typeof ThenWhat.contentTests !== 'function') { check(true, 'content checks not loaded (skipped)'); return; }
    if (!ThenWhat.content) { check(false, 'ThenWhat.content is not loaded'); return; }
    ThenWhat.contentTests(check);
  });

  var REAL = ThenWhat.content;
  if (REAL && typeof REAL === 'object' && Array.isArray(REAL.worlds)) {
    var realWorldPick = function (g, level) {
      var worlds = REAL.worlds;
      var k = g % (worlds.length + 1);
      if (k < worlds.length) return { worldId: worlds[k].id, useCharacters: g % 2 === 0 };
      var b = REAL.builder;
      function nth(list, i) {
        var ok = list.filter(function (x) { return !x.levels || x.levels.indexOf(level) >= 0; });
        return ok[i % ok.length].id;
      }
      return { builtWorld: { where: nth(b.where, g), when: nth(b.when, g * 7), kind: nth(b.kind, g * 3), mission: nth(b.mission, g * 5) } };
    };

    [2, 3, 4, 5, 6].forEach(function (n) {
      ['sprout', 'weaver'].forEach(function (level) {
        add('real content: Twist rules, ' + level + ', ' + n + ' players, ' + REAL_SIM_GAMES.toLocaleString('en-US') + ' games' + (QUICK ? ' (quick mode)' : ''), function (t) {
          var st = twistSim(REAL, level, n, REAL_SIM_GAMES, 5000 + n + (level === 'weaver' ? 100 : 0), realWorldPick);
          t.eq(st.games, REAL_SIM_GAMES);
        });
      });
    });

    add('real content: every prompt shown fits its story stage and names the quest (decision 2026-10-29)', function (t) {
      var seen = { begin: 0, middle: 0, end: 0, twist: 0, final: 0 };
      ['sprout', 'weaver'].forEach(function (level) {
        for (var g = 0; g < 40; g++) {
          var pick = realWorldPick(g, level);
          var conf = { level: level, playerCount: 2 + (g % 5), useCharacters: true, nicknames: [] };
          for (var k in pick) conf[k] = pick[k];
          playGame(REAL, conf, mulberry32(g + 900), mulberry32(g + 950), {
            replaceRate: 0.2, passRate: 0.1,
            onStep: function (before, a, after) {
              if (after.phase !== 'RELAY_TURN' || after.turnState !== 'TURN_READY' || !after.promptId) return;
              if (before.turnState === 'TURN_READY' && before.promptId === after.promptId) return;
              var stage = E.storyStage(after);
              var p = REAL.prompts.filter(function (x) { return x.id === after.promptId; })[0];
              seen[stage]++;
              if (p.stages.indexOf(stage) < 0) t.ok(false, p.id + ' shown at stage ' + stage);
              var text = E.getView(after, REAL).prompt.text;
              if (/[{}]/.test(text)) t.ok(false, p.id + ' unfilled: ' + text);
            }
          });
        }
      });
      Object.keys(seen).forEach(function (k) { t.ok(seen[k] > 0, k + ' stage reached (' + seen[k] + ')'); });
      // No repeats within a game while the stage still has unseen prompts.
      var lv = { sprout: 0, weaver: 0 };
      ['sprout', 'weaver'].forEach(function (level) {
        var st = E.createSession({ level: level, worldId: REAL.worlds[0].id, playerCount: 3, useCharacters: true, nicknames: [] }, REAL, mulberry32(3));
        var shown = [];
        for (var i = 0; i < 40 && st.phase !== 'FATE_CHOICE'; i++) {
          if (st.phase === 'ROUND_BREAK') { st = act(st, A.CONTINUE_AFTER_BREAK, null, REAL); continue; }
          if (st.turnState === 'TURN_HANDOVER') { st = act(st, A.READY, null, REAL); shown.push(st.promptId); continue; }
          st = act(st, A.CONTINUE_UNRECORDED, null, REAL);
        }
        lv[level] = shown.length - shown.filter(function (id, j) { return shown.indexOf(id) === j; }).length;
      });
      t.eq(lv.sprout, 0, 'Sprout game with 3 players: no prompt twice');
      t.eq(lv.weaver, 0, 'Weaver game with 3 players: no prompt twice');
    });

    add('real content: every world and every build plays to an Ending in both levels', function (t) {
      ['sprout', 'weaver'].forEach(function (level) {
        REAL.worlds.forEach(function (w, i) {
          var g = playGame(REAL, { level: level, worldId: w.id, playerCount: 2 + (i % 5), useCharacters: true, nicknames: [] },
            mulberry32(i + 1), mulberry32(i + 50), { recordRate: 0.3, replaceRate: 0.2, softenRate: 0.5, passRate: 0.1 });
          t.eq(g.state.phase, 'FATE_CHOICE', w.id);
          var v = E.getView(g.state, REAL);
          t.deepEq(v.fates.map(function (f) { return f.type; }), ['solved', 'changed', 'to-be-continued'], w.id + ' Fate order');
          v.fates.forEach(function (f) { t.ok(f.text, w.id + ' Fate text'); });
          var e = act(g.state, A.CHOOSE_FATE, { fateId: v.fates[1].id }, REAL);
          t.eq(e.phase, 'EPILOGUE');
          E.getView(e, REAL).album.forEach(function (row) { t.ok(row.promptText, 'album prompt text'); t.ok(row.label); });
        });
      });
      var b = REAL.builder, built = 0;
      b.where.forEach(function (wh) { b.when.forEach(function (wn) { b.kind.forEach(function (k) { b.mission.forEach(function (m) {
        var w = E.buildWorld({ where: wh.id, when: wn.id, kind: k.id, mission: m.id }, REAL);
        t.ok(w && w.title && w.world && w.quest && w.questTitle, 'build ' + wh.id + '/' + wn.id + '/' + k.id + '/' + m.id);
        t.ok(w.world.indexOf('{') < 0 && w.title.indexOf('{') < 0, 'template fully filled');
        built++;
      }); }); }); });
      t.ok(built > 0);
    });

    add('real content: prompt draw never repeats within 4, Replace never returns current or last 4', function (t) {
      ['sprout', 'weaver'].forEach(function (level) {
        for (var seed = 1; seed <= 100; seed++) {
          playGame(REAL, { level: level, worldId: REAL.worlds[seed % REAL.worlds.length].id, playerCount: 2 + (seed % 5), useCharacters: true, nicknames: [] },
            mulberry32(seed), mulberry32(seed + 7), {
              replaceRate: 0.4,
              onStep: function (prev, a, next) {
                if (a.type === 'REPLACE_PROMPT' && next !== prev) {
                  t.ok(prev.promptHistory.slice(-5).indexOf(next.promptId) < 0, 'replace');
                } else if (next.turnState === 'TURN_HANDOVER' && next.turnIndex !== prev.turnIndex) {
                  t.ok(next.promptHistory.slice(0, -1).slice(-4).indexOf(next.promptId) < 0, 'draw');
                }
                if (next.promptId) {
                  var p = REAL.prompts.filter(function (x) { return x.id === next.promptId; })[0];
                  t.ok(p && (p.level === level || p.level === 'all'), 'level pool');
                }
              }
            });
        }
      });
    });

    add('real content: labels use real character names, no repeats', function (t) {
      var s = E.createSession({ level: 'sprout', worldId: REAL.worlds[0].id, playerCount: 6, useCharacters: true, nicknames: ['Maya'] }, REAL, mulberry32(3));
      var labels = [0, 1, 2, 3, 4, 5].map(function (i) { return E.labelFor(s, i, REAL); });
      var names = REAL.characters.map(function (c) { return c.name; });
      t.ok(labels[0].indexOf('Maya · ') === 0);
      labels.slice(1).forEach(function (l) { t.ok(names.indexOf(l) >= 0, l); });
      t.eq(labels.filter(function (l, i) { return labels.indexOf(l) === i; }).length, 6);
    });
  } else {
    add('real content not loaded: property tests ran on the fixture only (not a failure)', function (t) { t.ok(true); });
  }

  // ------------------------------------------------------------- auto-run

  var api = { add: add, addGroup: addGroup, run: run, runAsync: runAsync, assert: assert, mulberry32: mulberry32, fixture: makeFixture,
    mode: MODE, simGames: SIM_GAMES, results: function () { return results; } };
  if (typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', function () { showMode(); runAsync(); });
  }
  return api;
})();
