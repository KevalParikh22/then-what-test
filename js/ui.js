/* ==========================================================================
   Then What?! — ui.js  ->  ThenWhat.ui
   Owner: Frontend Developer (Phase 3 step D)      Date: 2026-10-23
   Contract: docs/architecture/2026-10-23-phase-3-build-plan.md §3.5
   Screens:  design/2026-10-21-screen-flow.md
   A11y:     design/2026-10-22-accessibility-pass.md §2, §3, §12
   Notes:    docs/architecture/2026-10-23-ui-notes.md

   RULES
   - The ONLY file that touches the page. Engine, content, storage and audio
     are used through their public APIs only.
   - Every screen is drawn from ThenWhat.engine.getView(state, content).
     Player actions become engine actions (dispatch). The draft is saved
     after every action.
   - Every player-facing word comes from content.ui; icons come from
     content.uiIcons / content ids (inline sprite, <use href="#id">).
     All text goes in with textContent. No emoji.
   - Element ids start with "el-" so they never collide with sprite ids.
   - Accessibility: one persistent role=status region (announce()), focus
     moved on every screen change, native <dialog> for overlays.
   ========================================================================== */
window.ThenWhat = window.ThenWhat || {};

ThenWhat.ui = (function () {
  'use strict';

  var TW = window.ThenWhat;
  var E = TW.engine;
  var C = TW.content;
  var ST = TW.storage;
  var AU = TW.audio;
  var UI = (C && C.ui) || {};
  var UI_ICONS = (C && C.uiIcons) || {};
  var A = (E && E.ACTIONS) || {};

  var doc = document;
  var root = doc.documentElement;
  var NS = 'http://www.w3.org/2000/svg';

  var GUARD_MS = 400;          // double-tap guard on kid buttons (screen flow §6)
  var PROMPT_MIN_PX = 22;      // fitPrompt: smallest prompt on a phone (decision 2026-10-29)
  var UNPIN_RATIO = 0.35;      // A-04: un-pin the bottom bar above 35% of the height
  var SAVING_SHOW_MS = 300;    // show "Saving your turn..." only if it takes this long
  var STYLES = ['lantern', 'collectible', 'sticker'];
  var BUILD_STEPS = [
    { list: 'where', q: 'q-where' },
    { list: 'when', q: 'q-when' },
    { list: 'kind', q: 'q-kind' },
    { list: 'mission', q: 'q-quest' }
  ];
  var FATE_LABEL = { solved: 'fate-solved', changed: 'fate-changed', 'to-be-continued': 'fate-continued' };
  var IN_STORY = { RELAY_TURN: 1, ROUND_BREAK: 1, FATE_CHOICE: 1 };
  var TURN_FAMILY = { turn: 1, recording: 1, saving: 1 };

  function rng() { return Math.random(); }
  function $(id) { return doc.getElementById(id); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function nowIso() { return new Date().toISOString(); }
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function wideScreen() {
    try { return window.matchMedia('(min-width: 768px)').matches; } catch (e) { return false; }
  }

  // ------------------------------------------------------------------ text

  var missingKeys = {};
  /** content.ui[key] with [name] [n] [max] [label] [type] filled in. */
  function T(key, vars) {
    var s = UI[key];
    if (typeof s !== 'string') {
      if (!missingKeys[key]) {
        missingKeys[key] = true;
        try { console.warn('[ThenWhat.ui] missing ui text:', key); } catch (e) { /* ignore */ }
      }
      return '';
    }
    if (vars) {
      for (var k in vars) if (has(vars, k)) s = s.split('[' + k + ']').join(String(vars[k]));
    }
    return s;
  }

  // ------------------------------------------------------------------ DOM helpers

  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) add(el, c[i]); return; }
    el.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
  }

  /** h('button', {class, text, onclick, ...attrs}, ...children). Text is always textContent. */
  function h(tag, props) {
    var el = doc.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!has(props, k)) continue;
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'text') el.textContent = v;
        else if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }

  /** <svg class="icon"><use href="#id"/></svg>, always hidden from AT. */
  function icon(id, cls) {
    var s = doc.createElementNS(NS, 'svg');
    s.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var u = doc.createElementNS(NS, 'use');
    u.setAttribute('href', '#' + (id || 'ui-person'));
    s.appendChild(u);
    return s;
  }
  function ico(key, cls) { return UI_ICONS[key] ? icon(UI_ICONS[key], cls) : null; }
  function swapIcon(el, id) {
    var u = el && el.querySelector('use');
    if (u) u.setAttribute('href', '#' + id);
  }

  /** "a · b" -> spans, with the dot hidden from screen readers (A-23). */
  function dotted(text) {
    var out = [];
    String(text).split(' · ').forEach(function (part, i) {
      if (i) out.push(' ', h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }), ' ');
      out.push(h('span', { text: part }));
    });
    return out;
  }
  function vh(text) { return h('span', { class: 'vh', text: text }); }
  /** "Title" -> "Title. " unless it already ends a sentence ("Party time!" -> "Party time! "). */
  function lead(title) { title = String(title || ''); return /[.!?]$/.test(title) ? title + ' ' : title + '. '; }

  var uid = 0;
  function nextId(prefix) { uid += 1; return 'el-' + prefix + uid; }

  // ------------------------------------------------------------------ live region (A-03)

  var statusEl = null;
  var announceTimer = null;
  /** The one status region. Clear, then set after a delay so a repeat is read again.
      Callers that also move focus pass a longer delay (never the same tick). */
  function announce(text, delay) {
    if (!statusEl || !text) return;
    clearTimeout(announceTimer);
    statusEl.textContent = '';
    announceTimer = setTimeout(function () { statusEl.textContent = text; }, delay || 100);
  }
  function plainForSpeech(text) {
    return String(text).replace(/ · /g, ', ').replace(/\?!/g, '?');
  }

  // ------------------------------------------------------------------ focus (A-02)

  var dialogs = [];          // open dialog records, top last
  function topDialog() { return dialogs.length ? dialogs[dialogs.length - 1] : null; }

  function focusEl(el) {
    if (!el) return;
    function run() {
      if (!el.isConnected) return;
      try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* ignore */ } }
      ensureVisible(el);
    }
    requestAnimationFrame(function () {
      run();
      // iOS VoiceOver sometimes ignores a focus call in the same task as the DOM change.
      setTimeout(function () {
        var d = topDialog();
        if (el.isConnected && doc.activeElement !== el && (!d || d.el.contains(el))) run();
      }, 50);
    });
  }
  function ensureVisible(el) {
    try {
      var r = el.getBoundingClientRect();
      var dockH = parseFloat(getComputedStyle(root).getPropertyValue('--dock-h')) || 0;
      if (topDialog() && topDialog().el.contains(el)) return;
      if (r.top < 0 || r.bottom > window.innerHeight - dockH) el.scrollIntoView({ block: 'center' });
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ app state

  var app = null;
  var state = null;            // engine state (plain JSON; saved as the draft)
  var view = null;             // engine.getView(state, content)
  var mode = 'game';           // 'game' | 'resume' | 'build' | 'build-result' | 'last-story'
  var setup = {
    level: 'sprout', worldId: null, built: null, playerCount: 3, useCharacters: true,
    names: ['', '', '', '', '', ''], cardStyle: 'lantern', bigScreen: false,
    pickNote: false, spookyNote: false
  };
  var build = { step: 0, picks: {}, from: 'setup' };
  var env = { dbOk: null, canRec: false, tts: false };
  var lastStory = null;        // storage.getLastSavedStory() result (not the active story)
  var story = freshStoryFlags();
  var epi = null;              // Your story data: {sessionId, turns, deleted, played}
  var pendingStart = false;    // Record tapped, waiting for the mic (permission prompt)
  var micAskOpen = false;
  var saving = null;           // promise while a clip is being saved
  var savingTimer = null;
  var recStartedAt = 0;
  var lastKidTap = 0;
  var lastRender = 0;
  var fateSelAt = 0;
  var ticker = null;
  var awakeWanted = null;
  var guardOn = false;
  var renderedKey = '';
  var currentFocus = null;     // default focus target of the screen on show
  var pauseRec = null;         // open Pause dialog record
  var sheetRec = null;         // open tools sheet record
  var speakingBtn = null;
  var playback = null;         // {kind:'all'|'one', rowId}

  function freshStoryFlags() {
    return {
      micAskDone: false, noMicNoteShown: false, overtimeSaid: {}, noticeSaid: {},
      localNotice: null, savedAudio: {}, startedAt: null, completedAt: null
    };
  }

  function phase() { return view ? view.phase : 'SETUP'; }
  function inStory() { return mode === 'game' && !!IN_STORY[phase()]; }
  function levelNow() {
    return view && view.phase !== 'SETUP' && view.level ? view.level : setup.level;
  }

  // ------------------------------------------------------------------ prefs (never names)

  function loadPrefsIntoSetup() {
    var p = ST.loadPrefs() || {};
    if (p.level === 'sprout' || p.level === 'weaver') setup.level = p.level;
    if (typeof p.playerCount === 'number') setup.playerCount = p.playerCount;
    if (typeof p.useCharacters === 'boolean') setup.useCharacters = p.useCharacters;
    if (STYLES.indexOf(p.cardStyle) >= 0) setup.cardStyle = p.cardStyle;
    if (typeof p.bigScreen === 'boolean') setup.bigScreen = p.bigScreen;
  }
  function savePrefs() {
    ST.savePrefs({
      level: setup.level, playerCount: setup.playerCount, useCharacters: setup.useCharacters,
      cardStyle: setup.cardStyle, bigScreen: setup.bigScreen
    });
  }

  function applyTheme() {
    root.setAttribute('data-level', levelNow());
    root.setAttribute('data-card-style', setup.cardStyle);
    if (setup.bigScreen) root.setAttribute('data-display', 'tv');
    else root.removeAttribute('data-display');
    root.classList.toggle('is-paused', !!(view && view.paused && mode === 'game'));
  }

  // ------------------------------------------------------------------ engine dispatch

  /** One engine action. Returns true when the state changed. */
  function dispatch(action, opts) {
    var prev = state;
    var next = E.reduce(prev, action, C, rng);
    if (next === prev) return false;
    state = next;
    persist(prev, next, action);
    sync(opts);
    return true;
  }

  /** Draft after every action; turn and session records (DRD §3.2). */
  function persist(prev, next, action) {
    if (next.phase === 'SETUP' || next.phase === 'EPILOGUE') ST.clearDraft();
    else ST.saveDraft(next);

    if (next.phase === 'SETUP' && prev && prev.phase !== 'SETUP') absorbSetup(next);
    if (action.type === A.START) {
      story = freshStoryFlags();
      story.startedAt = nowIso();
      epi = null;
    }
    if (action.type === A.TICK || env.dbOk === false) return;

    if (prev && prev.sessionId === next.sessionId && Array.isArray(prev.turns) &&
        Array.isArray(next.turns) && next.turns.length > prev.turns.length) {
      for (var i = prev.turns.length; i < next.turns.length; i++) saveTurnEntry(next, next.turns[i]);
    }
    if (action.type === A.ABANDON) saveSessionRecord(prev, 'abandoned');
    else if (next.phase !== 'SETUP') saveSessionRecord(next, next.status);
  }

  // The UI reads engine state fields here only to persist records the view does not carry
  // (twistIds, softenedTwistIds, contentVersion, the raw turn log). See ui-notes §6.
  function saveTurnEntry(s, t) {
    if (!t || !t.turnId || story.savedAudio[t.turnId]) return;
    ST.saveTurn({
      id: t.turnId,
      sessionId: s.sessionId,
      round: t.round,
      turnIndex: t.turnIndex,
      playerIndex: t.playerIndex,
      nickname: (s.nicknames && s.nicknames[t.playerIndex]) || null,
      characterId: t.characterId || null,
      promptId: t.promptId,
      inputMethod: t.inputMethod,
      durationSeconds: t.durationSeconds || 0,
      audioBlob: null,
      mimeType: null,
      audioByteSize: 0,
      createdAt: nowIso()
    });
  }

  function saveSessionRecord(s, status) {
    if (!s || typeof s.sessionId !== 'string' || s.phase === 'SETUP') return;
    if (status === 'completed' && !story.completedAt) story.completedAt = nowIso();
    ST.saveSession({
      sessionId: s.sessionId,
      contentVersion: s.contentVersion || (C && C.version) || null,
      worldId: s.worldId || null,
      builtWorld: s.builtWorld || null,
      level: s.level,
      playerCount: s.playerCount,
      useCharacters: !!s.useCharacters,
      totalRounds: s.maxRounds,
      completedRounds: s.completedRounds || 0,
      twistIds: (s.twistIds || []).slice(),
      softenedTwistIds: (s.softenedTwistIds || []).slice(),
      chosenFateId: s.chosenFateId || null,
      micBlocked: !!s.micBlocked,
      startedAt: story.startedAt || nowIso(),
      completedAt: status === 'completed' ? story.completedAt : null,
      status: status || 'active'
    });
  }

  /** Back on Setup after RESTART / ABANDON: keep level, count, characters, names (S1). */
  function absorbSetup(s) {
    var v = E.getView(s, C);
    var su = v.setup || {};
    if (su.level === 'sprout' || su.level === 'weaver') setup.level = su.level;
    if (typeof su.playerCount === 'number') setup.playerCount = su.playerCount;
    if (typeof su.useCharacters === 'boolean') setup.useCharacters = su.useCharacters;
    var names = ['', '', '', '', '', ''];
    (su.nicknames || []).forEach(function (n, i) { if (i < 6 && typeof n === 'string') names[i] = n; });
    setup.names = names;
    setup.worldId = null;
    setup.built = null;
    setup.pickNote = false;
    setup.spookyNote = false;
    mode = 'game';
    epi = null;
    stopPlayback();
    refreshLastStory();
  }

  // ------------------------------------------------------------------ sync and render

  function keyOf() {
    if (mode !== 'game') return 'm:' + mode + ':' + build.step;
    var scr = TURN_FAMILY[view.screen] ? 'T' : view.screen;
    return 'g:' + scr + ':' + (view.currentTurnId || '') + ':' + view.phase + ':' + (view.breakState || '');
  }

  /** After any change: refresh the view, then either redraw or update in place. */
  function sync(opts) {
    opts = opts || {};
    view = E.getView(state, C);
    applyTheme();
    if (!opts.noRender) {
      var key = keyOf();
      if (!opts.full && key === renderedKey && mode === 'game') updateInPlace();
      else renderScreen(opts);
      renderedKey = keyOf();
    }
    syncPause();
    syncTicker();
    syncAwake();
    syncGuard();
  }

  function renderScreen(opts) {
    stopSpeakingUi();
    if (mode === 'resume') return renderResume();
    if (mode === 'build') return renderBuildStep();
    if (mode === 'build-result') return renderBuildResult();
    if (mode === 'last-story') return renderLastStory(opts);
    switch (view.screen) {
      case 'handover': return renderHandover();
      case 'turn':
      case 'recording':
      case 'saving': return renderTurn(opts);
      case 'round-break': return renderRoundBreak();
      case 'twist': return renderTwist(opts);
      case 'fate': return renderFate();
      case 'epilogue': return renderEpilogue(opts);
      default: return renderSetup(opts);
    }
  }

  function updateInPlace() {
    refreshTools();
    if (TURN_FAMILY[view.screen]) updateTurnInPlace();
  }

  /** Draw a screen: header + main (content, then the pinned bar LAST in the DOM). */
  function screen(name, parts) {
    app.textContent = '';
    root.setAttribute('data-screen', name);
    if (parts.header) app.appendChild(parts.header);
    var main = h('main', { id: 'el-main', class: 'scr scr-' + name });
    main.appendChild(h('div', { class: 'content' }, parts.content));
    if (parts.dock) main.appendChild(parts.dock);
    app.appendChild(main);
    var h1 = main.querySelector('h1');
    doc.title = T('app-title') + (h1 ? ' · ' + h1.textContent.replace(/\s+/g, ' ').trim() : '');
    window.scrollTo(0, 0);
    lastRender = Date.now();
    watchDock();
    currentFocus = parts.focus || h1;
    if (!dialogs.length) focusEl(currentFocus);
    return main;
  }

  function dockEl(children, cls) {
    return h('div', { class: 'dock' + (cls ? ' ' + cls : '') }, children);
  }

  function kidOk() {
    var now = Date.now();
    if (now - lastKidTap < GUARD_MS || now - lastRender < GUARD_MS) return false;
    lastKidTap = now;
    return true;
  }

  /** A child-pressed 96px button (icon + word). */
  function kidBtn(key, onClick, opts) {
    opts = opts || {};
    var b = h('button', { type: 'button', class: 'btn kid ' + (opts.cls || 'b-pri'), id: opts.id || null },
      opts.icon === false ? null : (opts.icon ? icon(opts.icon) : ico(key)),
      h('span', { class: 'lbl', text: opts.text || T(key, opts.vars) }));
    b.addEventListener('click', function (e) {
      if (b.getAttribute('aria-disabled') === 'true') return;
      if (opts.noGuard || kidOk()) onClick(e);
    });
    return b;
  }

  /** A grown-up 48px button. */
  function toolBtn(key, onClick, opts) {
    opts = opts || {};
    var b = h('button', {
      type: 'button', class: 'tool' + (opts.cls ? ' ' + opts.cls : ''), id: opts.id || null,
      'aria-label': opts.label || null
    }, opts.iconOnly ? ico(key) : [ico(key), h('span', { text: opts.text || T(key) })]);
    b.addEventListener('click', function (e) {
      if (b.getAttribute('aria-disabled') === 'true') return;
      onClick(e);
    });
    return b;
  }

  function setDisabled(btn, dis, whyId) {
    if (dis) {
      btn.setAttribute('aria-disabled', 'true');
      if (whyId) btn.setAttribute('aria-describedby', whyId);
    } else {
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('aria-describedby');
    }
  }

  // ---- pinned bar un-pin rule (A-04) -----------------------------------------

  var dockObserver = null;
  /** The turn screen fits the phone without scrolling (decision 2026-10-29): the prompt
      shrinks from its level size, 2px at a time, down to PROMPT_MIN_PX. Past that the page
      scrolls, so large system text is never cut off. Not on the Big screen. */
  function fitPrompt() {
    var p = $('el-prompt');
    if (!p) return;
    p.style.fontSize = '';
    if (root.getAttribute('data-display') === 'tv') return;
    var size = parseFloat(getComputedStyle(p).fontSize);
    while (size > PROMPT_MIN_PX && root.scrollHeight > window.innerHeight + 1) {
      size = Math.max(PROMPT_MIN_PX, size - 2);
      p.style.fontSize = size + 'px';
    }
    // Still too tall: fold an open Twist to its title line (tap to open), as on later turns.
    var tw = doc.querySelector('#el-twistpin .tw-toggle');
    if (root.scrollHeight > window.innerHeight + 1 && tw && !tw.dataset.user && tw.getAttribute('aria-expanded') === 'true' && !wideScreen()) {
      tw.setAttribute('aria-expanded', 'false');
      $('el-tw-body').hidden = true;
      fitPrompt();
    }
  }

  function watchDock() {
    if (dockObserver) { dockObserver.disconnect(); dockObserver = null; }
    root.classList.remove('unpinned');
    var d = app && app.querySelector('.dock');
    if (!d) { root.style.setProperty('--dock-h', '0px'); return; }
    function check() {
      if (!d.isConnected) return;
      var hgt = d.getBoundingClientRect().height;
      var un = root.classList.contains('unpinned') || hgt > UNPIN_RATIO * window.innerHeight;
      root.classList.toggle('unpinned', un);
      root.style.setProperty('--dock-h', (un ? 0 : Math.ceil(hgt)) + 'px');
      fitPrompt();
    }
    if (window.ResizeObserver) { dockObserver = new ResizeObserver(check); dockObserver.observe(d); }
    check();
  }

  // ------------------------------------------------------------------ read-aloud (A-05)

  function hearBtn(key, getText, cls) {
    var name = T(key);
    var b = h('button', {
      type: 'button', class: cls || 'hear', 'aria-label': name, 'aria-pressed': 'false', 'data-name': name
    }, icon('ui-read-aloud'));
    b.addEventListener('click', function () {
      speakText(typeof getText === 'function' ? getText() : getText, b);
    });
    return b;
  }
  /** Tap-the-text-to-hear: a pointer-only extra (no role, not focusable). */
  function sayOnTap(el, text) {
    el.classList.add('saytap');
    el.addEventListener('click', function () { if (env.tts) speakText(text, null); });
    return el;
  }
  function resetSayBtn(btn) {
    if (!btn) return;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', btn.getAttribute('data-name') || '');
    swapIcon(btn, 'ui-read-aloud');
  }
  function stopSpeakingUi() {
    AU.stopSpeaking();
    if (speakingBtn) { resetSayBtn(speakingBtn); speakingBtn = null; }
  }
  function speakText(text, btn) {
    var same = btn && speakingBtn === btn;
    stopSpeakingUi();
    if (same || !env.tts || !text) return;
    var started = AU.speak(plainForSpeech(text), {
      rate: levelNow() === 'weaver' ? 1.0 : 0.9,
      onEnd: function () { if (speakingBtn === btn) { resetSayBtn(btn); speakingBtn = null; } }
    });
    if (started && btn) {
      speakingBtn = btn;
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-label', T('stop-hearing'));
      swapIcon(btn, UI_ICONS['stop-hearing'] || 'ui-read-aloud-stop');
    }
  }

  // ------------------------------------------------------------------ shared bits

  var SHAPES_FALLBACK = 'shape-circle';
  function shapeId(i) {
    var v = '';
    try { v = getComputedStyle(root).getPropertyValue('--player-' + (i + 1) + '-shape'); } catch (e) { v = ''; }
    v = String(v || '').trim().replace(/["']/g, '');
    return v || SHAPES_FALLBACK;
  }
  function charIcon(p) { return (p && p.characterIcon) || UI_ICONS['player-n'] || 'ui-person'; }
  function findById(list, id) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /** Turn order track. mode "next" (hand-over) or "now" (turn). */
  function trackEl(markKey) {
    var idx = view.player ? view.player.index : -1;
    return h('ol', { class: 'track', 'aria-label': T('turn-order') }, view.roster.map(function (p, i) {
      var cur = i === idx;
      return h('li', { class: 'pc-' + (i + 1) + (cur ? ' now' : ''), 'aria-current': cur ? 'step' : null },
        icon(charIcon(p), 'face'),
        h('span', { class: 'nm' }, dotted(p.label)),
        icon(shapeId(i), 'sh'),
        cur ? h('span', { class: 'nowtag', text: T(markKey) }) : null);
    }));
  }

  /** World + quest chip (A-08: the visible text is the name; aria-expanded). */
  function worldChip() {
    var w = view.world;
    if (!w) return [null, null];
    var panelId = 'el-wpanel';
    var btn = h('button', { type: 'button', class: 'wchip', id: 'el-wchip', 'aria-expanded': 'false', 'aria-controls': panelId },
      h('span', { class: 'tag k-world' }, icon('card-world'), ' ', T('type-world')), ' ',
      h('span', { class: 'tx' }, dotted(w.title)), ' ',
      h('span', { class: 'tag k-quest' }, icon('card-quest'), ' ', T('type-quest')));
    var questLine = (w.questTitle ? lead(w.questTitle) : '') + w.quest;
    var panel = h('div', { id: panelId, class: 'wpanel', hidden: true },
      h('div', { class: 'wrow' },
        h('p', null, h('strong', { text: w.title + ': ' }), sayOnTap(h('span', { text: w.text }), w.text)),
        hearBtn('hear-world', lead(w.title) + w.text)),
      h('div', { class: 'wrow' },
        h('p', null, h('strong', { text: T('quest-label') + ' ' + (w.questTitle ? lead(w.questTitle) : '') }),
          sayOnTap(h('span', { text: w.quest }), w.quest)),
        hearBtn('hear-quest', questLine)));
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      watchDock();
    });
    return [btn, panel];
  }

  /** Header of story screens: world chip, tools (button on phone, group from 768px). */
  function storyHeader() {
    var bits = worldChip();
    var bar = h('div', { class: 'toolsbar', role: 'group', 'aria-label': T('tools'), id: 'el-toolsbar' });
    fillTools(bar, 'bar');
    var openBtn = toolBtn('tools', function () { openTools(openBtn); },
      { iconOnly: true, label: T('tools'), id: 'el-tools-btn', cls: 'ic tools-open' });
    return h('header', { class: 'top' },
      h('div', { class: 'toprow' }, bits[0], h('span', { class: 'sp' }), h('div', { class: 'toolsarea' }, bar, openBtn)),
      bits[1]);
  }
  function titleHeader() {
    return h('header', { class: 'top title' }, h('span', { class: 'logo', 'aria-hidden': 'true', text: T('app-title') }));
  }

  /** Card markup from the cards.css contract. */
  function cardEl(o) {
    var u = nextId('c');
    var t = o.type;
    var labelled = u + '-type ' + (o.title ? u + '-title' : u + '-text');
    var art = null;
    if (!o.compact) {
      art = h('div', { class: 'card__art', 'aria-hidden': 'true' },
        h('span', { class: 'card__art-icon' }, icon(o.artIcon || ('card-' + t))));
    }
    var say = o.say ? hearBtn(o.say, o.sayText || ((o.title ? lead(o.title) : '') + o.text), 'card__say') : null;
    return h(o.tag || 'article', {
      class: 'card' + (o.compact ? ' card--compact' : '') + (o.tiltLeft ? ' card--tilt-left' : ''),
      'data-card-type': t,
      'aria-labelledby': o.tag === 'div' ? null : labelled,
      'aria-hidden': o.hidden ? 'true' : null,
      id: o.id || null
    },
      h('div', { class: 'card__frame' },
        h('div', { class: 'card__band' },
          h('span', { class: 'card__symbol' }, icon('card-' + t)),
          h('span', { class: 'card__type', id: u + '-type', text: T('type-' + t) })),
        say, art,
        h('div', { class: 'card__body' },
          o.title ? h(o.titleTag || 'h3', { class: 'card__title', id: u + '-title', tabindex: o.titleFocus ? '-1' : null }, dotted(o.title)) : null,
          h('p', { class: 'card__text', id: u + '-text', text: o.text })),
        h('div', { class: 'card__foot', 'aria-hidden': 'true' },
          h('span', { class: 'card__edge' }),
          h('span', { class: 'card__mark' }, icon(o.mark || ('card-' + t))))));
  }

  function noteEl(key, opts) {
    opts = opts || {};
    var ok = key === 'auto-stop' || key === 'deleted';
    return h('p', { class: 'note' + (ok ? ' ok' : '') + (opts.cls ? ' ' + opts.cls : ''), id: opts.id || null, tabindex: opts.focusable ? '-1' : null },
      ok ? icon('ui-check') : null, ok ? ' ' : null, T(key));
  }

  // ------------------------------------------------------------------ S0 Welcome back

  function renderResume() {
    var line = T('resume');
    var h1 = h('h1', { tabindex: '-1' }, sayOnTap(h('span', { text: line }), line));
    var w = view.world || {};
    var bits = [w.title, T('round-chip', { n: view.round, max: view.maxRounds })];
    if (view.player) bits.push(view.player.label);
    var chip = h('p', { class: 'storychip' }, icon(w.icon || 'card-world'), ' ', h('span', null, dotted(bits.join(' · '))));
    var keep = kidBtn('keep-going', function () {
      mode = 'game';
      sync({ full: true });
    }, { cls: 'b-go wide', id: 'el-keep' });
    var fresh = h('button', { type: 'button', class: 'lnk far', id: 'el-resume-new', text: T('resume-new') });
    fresh.addEventListener('click', function () { openStopConfirm(fresh); });
    screen('S0', {
      header: titleHeader(),
      content: [h('div', { class: 'qrow center' }, h1, hearBtn('hear-heading', line)), chip],
      dock: dockEl([keep, fresh])
    });
  }

  // ------------------------------------------------------------------ S1 Setup

  function readyWorlds() { return (C.worlds || []).filter(function (w) { return w && w.kind !== 'built'; }); }
  function builtView() { return setup.built ? E.buildWorld(setup.built, C) : null; }

  function radioTile(name, value, checked, body, onChange) {
    var id = 'el-r-' + name + '-' + value;   // prefixed: the sprite already uses ids like level-sprout
    var inp = h('input', { type: 'radio', class: 'vh', name: 'el-' + name, value: value, id: id });
    inp.checked = checked;
    inp.addEventListener('change', function () { if (inp.checked) onChange(); });
    return h('label', { class: 'tile' + (checked ? ' on' : ''), for: id }, inp, body,
      h('span', { class: 'pk', 'aria-hidden': 'true' }, icon(UI_ICONS.picked || 'ui-check'), ' ', T('picked')));
  }
  function markTiles(name) {
    var list = doc.querySelectorAll('input[name="el-' + name + '"]');
    for (var i = 0; i < list.length; i++) list[i].closest('.tile').classList.toggle('on', list[i].checked);
  }

  var setupMoreOpen = false;   // the More settings fold stays as the grown-up left it
  function renderSetup(opts) {
    opts = opts || {};
    var items = [];
    var h1 = h('h1', { class: 'vh', tabindex: '-1', text: T('setup-heading') });
    items.push(h1);
    items.push(h('div', { id: 'el-last-slot' }));

    // Level
    items.push(h('section', { class: 'sec', 'aria-labelledby': 'el-lv-h' },
      h('h2', { id: 'el-lv-h', text: T('level-heading') }),
      h('div', { class: 'tiles two', role: 'radiogroup', 'aria-labelledby': 'el-lv-h' },
        ['sprout', 'weaver'].map(function (lv) {
          return radioTile('level', lv, setup.level === lv,
            [icon(UI_ICONS['level-' + lv] || ('level-' + lv), 'ti'), h('span', { class: 'tl' }, dotted(T('level-' + lv)))],
            function () { onLevel(lv); });
        }))));

    // World
    var worldTiles = readyWorlds().map(function (w) {
      return radioTile('world', w.id, setup.worldId === w.id,
        [icon(w.icon, 'ti'), h('span', { class: 'tl', text: w.title })], function () { onWorld(w.id); });
    });
    var bw = builtView();
    if (bw) {
      worldTiles.push(radioTile('world', 'built', setup.worldId === 'built',
        [icon(bw.icon || 'card-world', 'ti'), h('span', { class: 'tl' }, dotted(bw.title))], function () { onWorld('built'); }));
    }
    var buildBtn = h('button', { type: 'button', class: 'tile tile-btn', id: 'el-build-btn', 'aria-label': bw ? T('change-world') : null },
      icon(UI_ICONS['build-world'] || 'card-world', 'ti'), h('span', { class: 'tl', text: bw ? T('change') : T('build-world') }));
    buildBtn.addEventListener('click', function () { startBuild(bw ? 'change' : 'setup'); });
    var note = h('p', { id: 'el-pick-note', class: 'note', hidden: !setup.pickNote, text: T('pick-world') });
    var spooky = setup.spookyNote ? h('p', { class: 'note', id: 'el-spooky-note', text: T('spooky-level') }) : null;
    var group = h('div', {
      class: 'tiles two', role: 'radiogroup', 'aria-labelledby': 'el-w-h', id: 'el-world-group',
      'aria-describedby': setup.pickNote ? 'el-pick-note' : null
    }, worldTiles, buildBtn);   // Build a World fills the grid's free spot (decision 2026-10-29)
    items.push(h('section', { class: 'sec', 'aria-labelledby': 'el-w-h', id: 'el-world-sec' },
      h('h2', { id: 'el-w-h', text: T('world-heading') }), group, note, spooky, h('div', { id: 'el-world-info' })));

    // Players
    var out = h('output', { class: 'num', id: 'el-pcount', text: String(setup.playerCount) });
    var minus = h('button', { type: 'button', class: 'tool step', id: 'el-p-minus', 'aria-label': T('fewer-players') }, icon('ui-minus'));
    var plus = h('button', { type: 'button', class: 'tool step', id: 'el-p-plus', 'aria-label': T('more-players') }, icon('ui-plus'));
    var namesBox = h('div', { class: 'fields' });
    function syncStep() {
      out.textContent = String(setup.playerCount);
      setDisabled(minus, setup.playerCount <= 2, 'el-p-min-why');
      setDisabled(plus, setup.playerCount >= 6, 'el-p-max-why');
      renderNameFields();
    }
    function stepBy(d) {
      setup.playerCount = Math.max(2, Math.min(6, setup.playerCount + d));
      savePrefs();
      syncStep();
      announce(T('players-count', { n: setup.playerCount }));
    }
    minus.addEventListener('click', function () { if (minus.getAttribute('aria-disabled') !== 'true') stepBy(-1); });
    plus.addEventListener('click', function () { if (plus.getAttribute('aria-disabled') !== 'true') stepBy(1); });
    items.push(h('section', { class: 'sec', 'aria-labelledby': 'el-p-h' },
      h('h2', { id: 'el-p-h' }, ico('players-heading'), ' ', T('players-heading')),
      h('div', { class: 'stepper', role: 'group', 'aria-labelledby': 'el-p-h' }, minus, out, plus),
      h('p', { class: 'vh', id: 'el-p-min-why', text: T('players-min') }),
      h('p', { class: 'vh', id: 'el-p-max-why', text: T('players-max') })));

    // Use characters
    var sw = h('button', { type: 'button', role: 'switch', class: 'switch', id: 'el-chars-sw', 'aria-checked': String(setup.useCharacters), 'aria-describedby': 'el-chars-help' },
      h('span', { class: 'swl', text: T('use-characters') }), h('span', { class: 'sw', 'aria-hidden': 'true' }));
    sw.addEventListener('click', function () {
      setup.useCharacters = !setup.useCharacters;
      sw.setAttribute('aria-checked', String(setup.useCharacters));
      savePrefs();
    });
    // Grown-up settings fold into one row so Setup fits a phone (decision 2026-10-29)
    var more = [];
    more.push(h('div', { class: 'tog' }, sw, h('p', { class: 'small', id: 'el-chars-help', text: T('characters-help') })));

    // Names (optional; typing only here; never saved in prefs)
    function renderNameFields() {
      namesBox.textContent = '';
      for (var i = 0; i < setup.playerCount; i++) {
        (function (i) {
          var id = 'el-name-' + (i + 1);
          var inp = h('input', {
            id: id, type: 'text', maxlength: '12', autocomplete: 'off', autocapitalize: 'words',
            spellcheck: 'false', autocorrect: 'off', enterkeyhint: i === setup.playerCount - 1 ? 'done' : 'next',
            placeholder: T('name-hint'), 'aria-describedby': 'el-names-privacy'
          });
          inp.value = setup.names[i] || '';
          inp.addEventListener('input', function () { setup.names[i] = inp.value; });
          namesBox.appendChild(h('div', { class: 'fld' }, h('label', { for: id, text: T('player-n', { n: i + 1 }) }), inp));
        })(i);
      }
    }
    var namesDisc = h('details', { class: 'disc', id: 'el-names-disc' },
      h('summary', { text: T('names-toggle') }),
      h('p', { class: 'small', id: 'el-names-privacy', text: T('names-privacy') }), namesBox);
    if (setup.names.some(function (n) { return n && n.trim(); })) namesDisc.open = true;
    more.push(namesDisc);

    // Card style (AC 1.1.7)
    var styleName = h('span', { class: 'cur', text: T('style-' + setup.cardStyle) });
    var preview = h('div', { class: 'style-preview', 'aria-hidden': 'true' });
    function renderPreview() {
      preview.textContent = '';
      var w = setup.worldId === 'built' && bw ? { title: bw.title, world: bw.world, icon: bw.icon }
        : (findById(C.worlds, setup.worldId) || readyWorlds()[0]);
      if (w) preview.appendChild(cardEl({ type: 'world', title: w.title, text: w.world, mark: w.icon, artIcon: w.icon, tag: 'div', hidden: true }));
    }
    var styleDisc = h('details', { class: 'disc', id: 'el-style-disc' },
      h('summary', null, h('span', { text: T('card-style') }), ' ', h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }), ' ', styleName),
      h('div', { class: 'tiles three', role: 'radiogroup', 'aria-label': T('card-style') },
        STYLES.map(function (st) {
          return radioTile('cardstyle', st, setup.cardStyle === st,
            [h('span', { class: 'swatch sw-' + st, 'aria-hidden': 'true' }, h('i')), h('span', { class: 'tl', text: T('style-' + st) })],
            function () {
              setup.cardStyle = st;
              savePrefs();
              applyTheme();
              styleName.textContent = T('style-' + st);
              markTiles('cardstyle');
            });
        })), preview);
    more.push(styleDisc);

    // Big screen
    var bs = h('button', { type: 'button', role: 'switch', class: 'switch', id: 'el-big-sw', 'aria-checked': String(setup.bigScreen) },
      h('span', { class: 'swl' }, ico('big-screen'), ' ', T('big-screen')), h('span', { class: 'sw', 'aria-hidden': 'true' }));
    bs.addEventListener('click', function () {
      setup.bigScreen = !setup.bigScreen;
      bs.setAttribute('aria-checked', String(setup.bigScreen));
      savePrefs();
      applyTheme();
      watchDock();
    });
    more.push(h('div', { class: 'tog' }, bs));
    var moreDisc = h('details', { class: 'disc', id: 'el-more-disc' },
      [h('summary', { text: T('more-settings') })].concat(more));
    moreDisc.open = setupMoreOpen || namesDisc.open;
    moreDisc.addEventListener('toggle', function () { setupMoreOpen = moreDisc.open; watchDock(); });
    items.push(moreDisc);
    items.push(h('div', { id: 'el-foot-slot', class: 'foot' }));

    var startBtn = kidBtn('start', onStart, { id: 'el-start', icon: UI_ICONS.start || 'ui-continue', cls: 'b-go wide' });

    var focus = opts.focusId ? null : h1;
    screen('S1', { header: titleHeader(), content: items, dock: dockEl([startBtn]), focus: focus });
    syncStep();
    renderWorldInfo();
    renderPreview();
    fillLastSlot();
    fillFootSlot();
    if (opts.focusId && $(opts.focusId)) { currentFocus = $(opts.focusId); if (!dialogs.length) focusEl(currentFocus); }
    if (opts.announce) announce(T(opts.announce), 400);

    function renderWorldInfo() {
      var box = $('el-world-info');
      if (!box) return;
      box.textContent = '';
      var text = null;
      if (setup.worldId === 'built' && bw) text = bw.world;
      else if (setup.worldId) { var w = findById(C.worlds, setup.worldId); text = w ? w.world : null; }
      if (text) box.appendChild(h('div', { class: 'winfo' }, sayOnTap(h('p', { text: text }), text), hearBtn('hear-world', text)));
      renderPreview();
    }
    function onWorld(id) {
      setup.worldId = id;
      setup.pickNote = false;
      setup.spookyNote = false;
      note.hidden = true;
      group.removeAttribute('aria-describedby');
      var sp = $('el-spooky-note');
      if (sp) sp.remove();
      markTiles('world');
      renderWorldInfo();
    }
    function onLevel(lv) {
      setup.level = lv;
      savePrefs();
      applyTheme();
      var built = setup.built ? E.buildWorld(setup.built, C) : null;
      if (built && built.levels && built.levels.indexOf(lv) < 0) {
        // Spooky House is Tale Weaver only (N7): clear the build and say why.
        setup.built = null;
        if (setup.worldId === 'built') setup.worldId = null;
        setup.spookyNote = true;
        renderSetup({ focusId: 'el-r-level-' + lv, announce: 'spooky-level' });
        return;
      }
      markTiles('level');
    }
  }

  function fillLastSlot() {
    var slot = $('el-last-slot');
    if (!slot) return;
    slot.textContent = '';
    if (!lastStory) return;
    // last-story is the PRD-fixed "Your last story is still saved · Listen · Delete";
    // the links get fuller names (last-listen / last-delete) via a hidden suffix (A-24).
    // Setup's Delete clears every saved story (decision 2026-10-28), so say how many.
    var n = lastStory.savedCount || 1;
    var parts = (n > 1 ? T('last-stories', { n: n }) : T('last-story')).split(' · ');
    function sfx(key, visible) {
      var full = T(key, { n: n });
      return full.indexOf(visible) === 0 ? full.slice(visible.length) : ' ' + full;
    }
    function sep() { return [' ', h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }), ' ']; }
    var listen = h('button', { type: 'button', class: 'lnk', id: 'el-last-listen' }, parts[1] || '', vh(sfx('last-listen', parts[1] || '')));
    listen.addEventListener('click', function () { mode = 'last-story'; sync({ full: true }); });
    var del = h('button', { type: 'button', class: 'lnk', id: 'el-last-delete' }, parts[2] || '', vh(sfx(n > 1 ? 'last-delete-all' : 'last-delete', parts[2] || '')));
    del.addEventListener('click', function () { openDeleteConfirm(del, 'setup'); });
    slot.appendChild(h('p', { class: 'last' }, h('span', { text: parts[0] || '' }), sep(), listen, sep(), del));
  }

  function fillFootSlot() {
    var slot = $('el-foot-slot');
    if (!slot) return;
    slot.textContent = '';
    if (env.dbOk === false) slot.appendChild(h('p', { class: 'small', text: T('no-save') }));
    if (!env.canRec) slot.appendChild(h('p', { class: 'small', text: T('mic-missing') }));
  }

  function onStart() {
    var config = {
      level: setup.level,
      playerCount: setup.playerCount,
      useCharacters: setup.useCharacters,
      nicknames: setup.names.slice(0, setup.playerCount).map(function (n) { return (n || '').trim(); })
    };
    if (setup.worldId === 'built' && setup.built) config.builtWorld = setup.built;
    else if (setup.worldId) config.worldId = setup.worldId;
    var check = E.validateConfig(config, C);
    if (!check.ok) {
      if (check.errors.indexOf('pick-world') >= 0 || check.errors.indexOf('world-level') >= 0 ||
          check.errors.indexOf('bad-world') >= 0) {
        setup.pickNote = true;
        var note = $('el-pick-note');
        if (note) note.hidden = false;
        var group = $('el-world-group');
        if (group) group.setAttribute('aria-describedby', 'el-pick-note');
        var first = doc.querySelector('input[name="el-world"]');
        var sec = $('el-world-sec');
        if (sec) sec.scrollIntoView({ block: 'start' });
        focusEl(first);
        announce(T('pick-world'), 400);
      }
      return;
    }
    savePrefs();
    if (!state || state.phase !== 'SETUP') state = E.createSession(null, C, rng);
    mode = 'game';
    dispatch({ type: A.START, config: config }, { full: true });
  }

  // ------------------------------------------------------------------ S1a / S1b Build a World

  function stepItems(list) {
    var items = (C.builder && C.builder[list]) || [];
    return items.filter(function (x) { return !x.levels || x.levels.indexOf(setup.level) >= 0; });
  }
  function startBuild(from) {
    build = { step: 0, picks: from === 'change' && setup.built ? JSON.parse(JSON.stringify(setup.built)) : {}, from: from };
    mode = 'build';
    sync({ full: true });
  }
  function surprise() {
    BUILD_STEPS.forEach(function (st) {
      var items = stepItems(st.list);
      var it = items[Math.floor(rng() * items.length)] || items[0];
      if (it) build.picks[st.list] = it.id;
    });
    mode = 'build-result';
    sync({ full: true });
  }

  function renderBuildStep() {
    var st = BUILD_STEPS[build.step];
    var q = T(st.q);
    var items = stepItems(st.list);
    var back = toolBtn('back', function () {
      if (build.step === 0) { mode = 'game'; sync({ full: true, focusId: 'el-build-btn' }); }
      else { build.step -= 1; sync({ full: true }); }
    }, { id: 'el-back' });
    var prog = h('ol', { class: 'dots', 'aria-label': T('build-progress') }, BUILD_STEPS.map(function (s2, i) {
      return h('li', { class: 'dot' + (build.picks[s2.list] ? ' on' : '') + (i === build.step ? ' cur' : ''), 'aria-current': i === build.step ? 'step' : null },
        vh(T('step-of', { n: i + 1 })));
    }));
    var speakAll = q + ' ' + items.map(function (x) { return x.label; }).join(', ');
    var h1 = h('h1', { class: 'q', tabindex: '-1' }, sayOnTap(h('span', { text: q }), q));
    var grid = h('ul', { class: 'tiles grid3' }, items.map(function (x) {
      var cur = build.picks[st.list] === x.id;
      var b = h('button', { type: 'button', class: 'tile tile-btn' + (cur ? ' on' : ''), 'aria-pressed': cur ? 'true' : null, 'data-id': x.id },
        icon(x.icon, 'ti'), h('span', { class: 'tl', text: x.label }),
        cur ? h('span', { class: 'pk', 'aria-hidden': 'true' }, icon('ui-check'), ' ', T('picked')) : null);
      b.addEventListener('click', function () {
        if (Date.now() - lastRender < 250) return;
        build.picks[st.list] = x.id;
        var tiles = grid.querySelectorAll('.tile');
        for (var i = 0; i < tiles.length; i++) tiles[i].classList.toggle('on', tiles[i] === b);
        var go = function () {
          if (build.step < BUILD_STEPS.length - 1) { build.step += 1; mode = 'build'; }
          else mode = 'build-result';
          sync({ full: true });
        };
        if (reducedMotion()) go(); else setTimeout(go, 150);
      });
      return h('li', null, b);
    }));
    var sur = kidBtn('surprise-me', surprise, { cls: 'b-sec wide', id: 'el-surprise', noGuard: true });
    screen('S1a', {
      header: h('header', { class: 'top' }, h('div', { class: 'toprow' }, back, h('span', { class: 'sp' }), prog)),
      content: [h('div', { class: 'qrow' }, h1, hearBtn('hear-step', speakAll)), sur, grid]
    });
  }

  function renderBuildResult() {
    var w = E.buildWorld(build.picks, C);
    if (!w) { build.step = 0; mode = 'build'; return renderBuildStep(); }
    var h1 = h('h1', { tabindex: '-1' }, ico('build-result-heading'), ' ', T('build-result-heading'));
    var useBtn = kidBtn('use-world', function () {
      setup.built = { where: build.picks.where, when: build.picks.when, kind: build.picks.kind, mission: build.picks.mission };
      setup.worldId = 'built';
      setup.spookyNote = false;
      setup.pickNote = false;
      mode = 'game';
      sync({ full: true, focusId: 'el-r-world-built' });
    }, { cls: 'b-go wide', icon: 'ui-check', id: 'el-use-world' });
    var again = toolBtn('surprise-me', surprise, { id: 'el-reroll' });
    var chg = toolBtn('change', function () { build.step = 0; mode = 'build'; sync({ full: true }); }, { id: 'el-change' });
    screen('S1b', {
      header: titleHeader(),
      content: [h1,
        h('div', { class: 'cardrow' },
          cardEl({ type: 'world', title: w.title, text: w.world, mark: w.icon, artIcon: w.icon, say: 'hear-world', sayText: lead(w.title) + w.world, titleTag: 'h2' }),
          cardEl({ type: 'quest', title: w.questTitle, text: w.quest, mark: w.icon, say: 'hear-quest', sayText: lead(w.questTitle) + w.quest, titleTag: 'h2', tiltLeft: true })),
        h('div', { class: 'row2' }, again, chg)],
      dock: dockEl([useBtn])
    });
  }

  // ------------------------------------------------------------------ T0 Pass the story

  function noticesFor() {
    var out = [];
    if (view.notice) out.push(view.notice);
    if (story.localNotice && out.indexOf(story.localNotice) < 0) out.push(story.localNotice);
    story.localNotice = null;
    return out;
  }

  function renderHandover() {
    var p = view.player;
    var first = view.turnNumber === 1;
    var line = first ? T('first-turn', { name: p.label }) : T('pass', { name: p.label });
    var h1 = h('h1', { tabindex: '-1', class: 'passline' }, sayOnTap(h('span', null, dotted(line)), line));
    var content = [];
    if (!first) content.push(h('p', { class: 'call', text: T('table-call') }));
    content.push(h('div', { class: 'hand pc-' + (p.index + 1), 'aria-hidden': 'true' },
      icon(charIcon(p), 'hi'), h('span', { class: 'hl' }, dotted(p.label)), icon(shapeId(p.index), 'sh')));
    content.push(h('div', { class: 'qrow' }, h1, hearBtn('hear-pass', line)));
    // Big screen: nothing is passed, so the line is removed from the DOM (a11y §3 T0).
    if (!setup.bigScreen) content.push(h('p', { class: 'sub' }, ico('hand-phone'), ' ', T('hand-phone', { name: p.label })));
    noticesFor().forEach(function (k) { if (UI[k]) content.push(noteEl(k)); });
    content.push(trackEl('next-label'));
    screen('T0', {
      header: storyHeader(),
      content: content,
      dock: dockEl([kidBtn('ready', onReady, { id: 'el-ready', cls: 'b-go wide', icon: 'ui-continue' })])
    });
  }

  function onReady() {
    dispatch({ type: A.READY }, { full: true });
  }

  // ------------------------------------------------------------------ T1 Your turn (T2 / T3 in place)

  function recordAllowed() {
    return !!(view.recordOffered && env.canRec && env.dbOk !== false);
  }

  function twistPin() {
    var tw = view.twist;
    var expanded = tw.fresh || wideScreen();
    var hid = 'el-tw-h';
    var hear = hearBtn('hear-twist', function () { return view.twist ? lead(view.twist.name) + view.twist.text : ''; });
    var textP = h('p', { class: 'tw-tx' }, sayOnTap(h('span', { text: tw.text }), tw.text));
    var guide = h('p', { class: 'guide', text: T('twist-banner-guide') });
    var tag = h('span', { class: 'tag k-twist' }, icon('card-twist'), ' ', T('type-twist'));
    var body = h('div', { class: 'tw-body', id: 'el-tw-body', hidden: !expanded }, textP, guide);
    var toggle = h('button', { type: 'button', class: 'tw-toggle', 'aria-expanded': String(expanded), 'aria-controls': 'el-tw-body' },
      tag, ' ', h('span', { class: 'tw-name', text: tw.name }));
    toggle.addEventListener('click', function () {
      toggle.dataset.user = '1';   // fitPrompt never re-folds a Twist the player opened
      var o = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(o));
      body.hidden = !o;
      watchDock();
    });
    var h2 = h('h2', { id: hid, class: 'tw-h', tabindex: '-1' }, toggle);
    var el = h('section', { class: 'twistpin', id: 'el-twistpin', 'aria-labelledby': hid },
      h('div', { class: 'srow' }, h('div', null, h2, body), hear));
    return { el: el, focus: h2 };
  }

  function renderTurn(opts) {
    opts = opts || {};
    var p = view.player;
    var h1 = h('h1', { tabindex: '-1', id: 'el-turn-h' }, dotted(T('turn-start', { name: p.label })));
    var content = [h('div', { class: 'band pc-' + (p.index + 1) },
      icon(charIcon(p), 'bi'), h('div', { class: 'bt' }, h1), icon(shapeId(p.index), 'sh'))];
    var focus = null;
    var twistFocus = null;

    if (view.twist) {
      var tw = twistPin();
      content.push(tw.el);
      twistFocus = tw.focus;
      if (view.twist.fresh) focus = tw.focus;
    }
    if (view.spark) {
      var sp = h('p', { class: 'spark-tx', id: 'el-spark', tabindex: '-1' }, sayOnTap(h('span', { text: view.spark }), view.spark));
      content.push(h('section', { class: 'spark', 'aria-labelledby': 'el-spark-l' },
        h('div', { class: 'srow' },
          h('div', null, h('h2', { class: 'spark-l', id: 'el-spark-l', text: T('spark-label') }), sp),
          hearBtn('hear-spark', view.spark))));
      if (!focus) focus = sp;
    }

    // Turn Prompt (cards.css turn contract; focus target, no aria-live: A-03)
    var promptText = view.prompt ? view.prompt.text : '';
    var promptP = h('p', { class: 'card__text card__prompt' + (opts.fade && !reducedMotion() ? ' fadein' : ''), id: 'el-prompt', tabindex: '-1', text: promptText });
    sayOnTap(promptP, promptText);
    content.push(h('article', { class: 'card card--turn', 'data-card-type': 'prompt', 'aria-labelledby': 'el-tp-type' },
      h('div', { class: 'card__frame' },
        h('div', { class: 'card__band' },
          h('span', { class: 'card__symbol' }, icon('card-prompt')),
          h('span', { class: 'card__type', id: 'el-tp-type', text: T('type-prompt') }),
          hearBtn('hear-prompt', function () { return view.prompt ? view.prompt.text : ''; }, 'card__say')),
        h('div', { class: 'card__body' }, promptP))));
    if (!focus) focus = promptP;

    // Calm timer: a text label + an aria-hidden bar (never a progressbar, never numbers).
    content.push(h('div', { class: 'timer' + (view.timer.overtime ? ' late' : ''), id: 'el-timer' },
      h('p', { class: 'tl', id: 'el-timer-label', text: view.timer.overtime ? T('timer-done') : T('timer-plenty') }),
      h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { id: 'el-timer-fill' }))));
    content.push(trackEl('now-label'));

    // Pinned bar: one-time note, recording line, Record | Continue
    var noteKey = null;
    if (view.notice && (view.notice === 'mic-blocked' || view.notice === 'mic-missing' || view.notice === 'storage-full')) noteKey = view.notice;
    else if (!env.canRec && !story.noMicNoteShown && view.turnNumber === 1) noteKey = 'mic-missing';
    if (!env.canRec && view.turnNumber === 1) story.noMicNoteShown = true;
    var recLine = h('p', { class: 'recst', id: 'el-recline', hidden: true },
      h('span', { class: 'dotrec', 'aria-hidden': 'true' }), T('recording'));
    var acts = h('div', { class: 'acts', id: 'el-acts' });
    var dock = dockEl([noteKey ? noteEl(noteKey, { cls: 'dock-note' }) : null, recLine, acts], 'turn-dock');

    if (opts.focus === 'prompt') focus = promptP;
    else if (opts.focus === 'twist' && twistFocus) focus = twistFocus;
    screen('T1', { header: storyHeader(), content: content, dock: dock, focus: focus });
    renderActs();
    updateTimer();
    if (TURN_FAMILY[view.screen] && view.screen !== 'turn') updateTurnInPlace();
    if (opts.focus === 'rec' && $('el-rec')) { currentFocus = $('el-rec'); if (!dialogs.length) focusEl(currentFocus); }
    if (noteKey) {
      var nk = (view.currentTurnId || '') + ':' + noteKey;
      if (!story.noticeSaid[nk]) { story.noticeSaid[nk] = true; announce(T(noteKey), 600); }
    }
  }

  function renderActs() {
    var acts = $('el-acts');
    if (!acts) return;
    acts.textContent = '';
    var cont = kidBtn('continue-no-rec', function () {
      if (view.screen !== 'turn' || pendingStart) return;
      dispatch({ type: A.CONTINUE_UNRECORDED }, { full: true });
    }, { cls: 'b-sec', id: 'el-cont' });
    if (recordAllowed()) {
      acts.className = 'acts';
      var rec = h('button', { type: 'button', class: 'btn kid b-pri', id: 'el-rec' }, ico('record'), h('span', { class: 'lbl', text: T('record') }));
      rec.addEventListener('click', onRecButton);
      acts.appendChild(rec);
      acts.appendChild(cont);
    } else {
      acts.className = 'acts one';
      acts.appendChild(cont);
    }
    watchDock();
  }

  /** Record -> Stop -> Saving is the SAME element; focus stays on it (A-02). */
  function setRecButton(kind) {
    var btn = $('el-rec');
    if (!btn) return;
    var lbl = btn.querySelector('.lbl');
    clearTimeout(savingTimer);
    if (kind === 'stop') {
      btn.className = 'btn kid b-rec';
      swapIcon(btn, UI_ICONS.stop || 'ui-stop');
      lbl.textContent = T('stop');
      btn.setAttribute('aria-label', T('stop-recording'));
      btn.removeAttribute('aria-disabled');
    } else if (kind === 'saving') {
      btn.className = 'btn kid b-rec';
      btn.setAttribute('aria-disabled', 'true');
      savingTimer = setTimeout(function () {
        if (!btn.isConnected) return;
        lbl.textContent = T('saving');
        btn.setAttribute('aria-label', T('saving'));
      }, SAVING_SHOW_MS);
    }
  }

  function updateTurnInPlace() {
    updateTimer();
    var rec = view.screen === 'recording';
    var sav = view.screen === 'saving';
    if (rec || sav || pendingStart) {
      root.classList.add('is-recording');
      // Read-aloud and Continue are removed (not hidden) while the mic is open.
      var gone = doc.querySelectorAll('#el-main .hear, #el-main .card__say');
      for (var i = 0; i < gone.length; i++) gone[i].remove();
      var cont = $('el-cont');
      if (cont) {
        if (doc.activeElement === cont && $('el-rec')) focusEl($('el-rec'));
        cont.remove();
      }
      var acts = $('el-acts');
      if (acts) acts.className = 'acts one';
      setRecButton(sav ? 'saving' : 'stop');
      var line = $('el-recline');
      if (line) line.hidden = !rec;
      refreshTools();
      watchDock();
    } else {
      root.classList.remove('is-recording');
    }
  }

  function updateTimer() {
    var fill = $('el-timer-fill');
    if (!fill || !view || !view.timer) return;
    fill.style.width = (Math.round(view.timer.fraction * 1000) / 10) + '%';
    var late = !!view.timer.overtime;
    var box = $('el-timer');
    var lbl = $('el-timer-label');
    if (box) box.classList.toggle('late', late);
    if (lbl) lbl.textContent = late ? T('timer-done') : T('timer-plenty');
  }

  // ---- recording flow (audio-storage notes §3: reasons and the action mapping) ------

  function onRecButton() {
    var btn = $('el-rec');
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    if (pendingStart) { AU.stopRecording(); return; }            // Stop while the permission prompt is open
    if (view.screen === 'recording') {
      if (Date.now() - recStartedAt < GUARD_MS) return;
      stopAndSave({});
      return;
    }
    if (view.screen === 'turn' && kidOk()) onRecordTap();
  }

  function permissionState() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        return navigator.permissions.query({ name: 'microphone' })
          .then(function (r) { return r && r.state; }, function () { return 'unknown'; });
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve('unknown');
  }

  function onRecordTap() {
    if (!view.can[A.RECORD_STARTED] || pendingStart) return;
    stopSpeakingUi();
    if (story.micAskDone) { beginRecording(); return; }
    permissionState().then(function (st) {
      if (view.screen !== 'turn') return;
      if (st === 'granted') { story.micAskDone = true; beginRecording(); }
      else openMicAsk();
    });
  }

  function beginRecording() {
    if (!view.can[A.RECORD_STARTED] || pendingStart) return;
    var turnId = view.currentTurnId;
    pendingStart = true;
    syncTicker();
    updateTurnInPlace();
    AU.startRecording({ maxSeconds: E.recordLimitSeconds(state), onAutoStop: onAutoStop }).then(function (res) {
      pendingStart = false;
      if (res && res.ok) {
        if (view.currentTurnId !== turnId || !dispatch({ type: A.RECORD_STARTED })) {
          AU.stopRecording();                       // refused (paused or the turn moved on)
          sync({ full: true, focus: 'rec' });
          return;
        }
        recStartedAt = Date.now();
        announce(T('recording'));
        return;
      }
      var reason = res && res.reason;
      if (reason === 'cancelled' || !reason) {       // never sets micBlocked
        sync({ full: true, focus: 'rec' });
        return;
      }
      if (!dispatch({ type: A.RECORD_FAILED, reason: reason }, { full: true, focus: 'prompt' })) sync({ full: true, focus: 'prompt' });
    });
  }

  function onAutoStop() {
    if (view && view.turnState === 'TURN_RECORDING') stopAndSave({ auto: true });
  }
  function onMicDisconnect() {
    if (view && view.turnState === 'TURN_RECORDING') stopAndSave({});
  }

  function currentTurnSnapshot() {
    var p = view.player || {};
    return {
      id: view.currentTurnId,
      sessionId: view.sessionId,
      round: view.round,
      turnIndex: view.turnNumber,
      playerIndex: p.index,
      nickname: p.nickname || null,
      characterId: p.characterId || null,
      promptId: view.prompt ? view.prompt.id : null
    };
  }

  /** Stop -> RECORD_STOPPED -> stopRecording -> saveTurn -> RECORD_SAVED / RECORD_FAILED. */
  function stopAndSave(opts) {
    opts = opts || {};
    if (saving) return saving;
    var snap = currentTurnSnapshot();
    if (view.turnState === 'TURN_RECORDING') dispatch({ type: A.RECORD_STOPPED, autoStop: !!opts.auto });
    var done = function () { saving = null; };
    saving = AU.stopRecording().then(function (res) { return saveClip(res, snap); }).then(done, done);
    return saving;
  }

  function saveClip(res, snap) {
    if (!res || !res.ok) return finishTurn(E.actionForClip(res, null, snap.id));
    var rec = {
      id: snap.id, sessionId: snap.sessionId, round: snap.round, turnIndex: snap.turnIndex,
      playerIndex: snap.playerIndex, nickname: snap.nickname, characterId: snap.characterId,
      promptId: snap.promptId, inputMethod: 'microphone', durationSeconds: res.durationSeconds || 0,
      audioBlob: res.blob, mimeType: res.mimeType || null, audioByteSize: res.blob.size, createdAt: nowIso()
    };
    return ST.saveTurn(rec).then(function (r) {
      var action = E.actionForClip(res, r, snap.id);
      if (action.byteSize > 0) {
        story.savedAudio[snap.id] = true;
        if (res.cause === 'disconnect') story.localNotice = 'mic-stopped';
      }
      return finishTurn(action);
    });
  }

  function finishTurn(action) {
    clearTimeout(savingTimer);
    root.classList.remove('is-recording');
    if (!dispatch(action)) sync();
  }

  // ------------------------------------------------------------------ R1 / R2 round break and Twist

  function renderRoundBreak() {
    var line = T('round-done', { n: view.round });
    var h1 = h('h1', { tabindex: '-1' }, sayOnTap(h('span', { text: line }), line));
    var dots = h('div', { class: 'rounds', 'aria-hidden': 'true' });
    for (var r = 1; r <= view.maxRounds; r++) dots.appendChild(h('span', { class: 'rd' + (r <= view.round ? ' on' : '') }));
    var content = [h('div', { class: 'qrow center' }, h1, hearBtn('hear-heading', line)), dots,
      h('p', { class: 'sub center', text: T('round-chip', { n: view.round, max: view.maxRounds }) })];
    if (view.nextRoundIsLast) content.push(h('p', { class: 'lead center', text: T('last-round') }));
    screen('R1', {
      header: storyHeader(), content: content,
      dock: dockEl([kidBtn('keep-going', continueBreak, { cls: 'b-go wide', id: 'el-keep' })])
    });
  }
  function continueBreak() { dispatch({ type: A.CONTINUE_AFTER_BREAK }, { full: true }); }

  function renderTwist(opts) {
    opts = opts || {};
    var tw = view.twist;
    var h1 = h('h1', { tabindex: '-1', class: 'center' }, ico('twist-banner-title'), ' ', T('twist-banner-title'));
    var card = cardEl({ type: 'twist', title: tw.name, text: tw.text, mark: view.world && view.world.icon, say: 'hear-twist', titleTag: 'h2', titleFocus: true, id: 'el-twist-card' });
    var content = [h('p', { class: 'sub center', text: T('round-done', { n: view.round }) }), h1, card,
      h('p', { class: 'guide2 center', text: T('twist-banner-guide') })];
    if (tw.softened) content.push(h('p', { class: 'soft center', id: 'el-soft-done' }, icon('ui-soften'), ' ', T('soften-done')));
    else if (tw.canSoften) content.push(h('div', { class: 'softrow' }, toolBtn('soften-twist', function () { doSoften(); }, { id: 'el-soften' })));
    screen('R2', {
      header: storyHeader(), content: content,
      dock: dockEl([kidBtn('keep-going', continueBreak, { cls: 'b-go wide', id: 'el-keep' })]),
      focus: opts.focus === 'twist' ? card.querySelector('.card__title') : null
    });
  }

  // ------------------------------------------------------------------ F1 Ending choice

  function renderFate() {
    var w = view.world || {};
    var h1 = h('h1', { id: 'el-f-h', tabindex: '-1', text: T('fate-heading') });
    var content = [h1];
    if (!setup.bigScreen) content.push(h('p', { class: 'sub', text: T('fate-middle') }));
    var questLine = (w.questTitle ? lead(w.questTitle) : '') + (w.quest || '');
    content.push(h('div', { class: 'qchip' },
      h('p', null, h('span', { class: 'tag k-quest' }, icon('card-quest'), ' ', T('quest-label')), ' ',
        h('strong', { text: w.questTitle ? lead(w.questTitle) : '' }), w.quest || ''),
      hearBtn('hear-quest', questLine)));
    var confirmWrap = h('div', { class: 'acts one', id: 'el-fate-acts' });
    var group = h('div', { class: 'fates', role: 'radiogroup', 'aria-labelledby': 'el-f-h' }, view.fates.map(function (f, idx) {
      var typeLabel = T(FATE_LABEL[f.type] || 'fate-solved');
      var id = 'el-fate-' + idx;
      var inp = h('input', { type: 'radio', name: 'el-fate', class: 'vh', id: id, value: f.id, 'aria-labelledby': id + '-t ' + id + '-x' });
      var visual = h('div', { class: 'card card--compact', 'data-card-type': 'fate', 'aria-hidden': 'true' },
        h('div', { class: 'card__frame' },
          h('div', { class: 'card__band' }, h('span', { class: 'card__symbol' }, icon('card-fate')), h('span', { class: 'card__type', text: T('type-fate') })),
          h('div', { class: 'card__body' }, h('p', { class: 'card__title', id: id + '-t', text: typeLabel }), h('p', { class: 'card__text', id: id + '-x', text: f.text })),
          h('div', { class: 'card__foot' }, h('span', { class: 'card__edge' }), h('span', { class: 'card__mark' }, icon(w.icon || 'card-fate')))));
      var pick = h('label', { class: 'fate-pick', for: id }, inp, visual,
        h('span', { class: 'ours', 'aria-hidden': 'true' }, ico('our-pick'), ' ', T('our-pick')));
      inp.addEventListener('change', function () {
        fateSelAt = Date.now();
        var opts = group.querySelectorAll('.fate-opt');
        for (var i = 0; i < opts.length; i++) {
          var on = opts[i].contains(inp);
          opts[i].classList.toggle('on', on);
          var cardV = opts[i].querySelector('.card--compact');
          if (cardV) cardV.classList.toggle('is-selected', on);   // cards.css draws the picked outline
        }
        group.classList.add('has-pick');
        if (!$('el-fate-confirm')) {
          confirmWrap.appendChild(kidBtn('fate-confirm', onFateConfirm, { cls: 'b-go wide', icon: 'card-fate', id: 'el-fate-confirm', noGuard: true }));
          watchDock();
        }
        // Focus is NOT moved to the confirm: the group is still talking (a11y §3 F1).
        announce(T('ending-picked', { type: typeLabel }));
      });
      return h('div', { class: 'fate-opt' }, pick, h('div', { class: 'fate-say' }, hearBtn('hear-fate', lead(typeLabel) + f.text)));
    }));
    content.push(group);
    screen('F1', { header: storyHeader(), content: content, dock: dockEl([confirmWrap], 'fate-dock') });
  }

  var fateBusy = false;
  function onFateConfirm() {
    if (Date.now() - fateSelAt < GUARD_MS || fateBusy) return;   // A-10: a double tap on a card can't also confirm
    if (!kidOk()) return;
    var sel = doc.querySelector('input[name="el-fate"]:checked');
    if (!sel) return;
    fateBusy = true;
    if (!dispatch({ type: A.CHOOSE_FATE, fateId: sel.value }, { full: true })) fateBusy = false;
  }

  // ------------------------------------------------------------------ E1 Your story / S1c Your last story

  function renderEpilogue(opts) {
    opts = opts || {};
    if (!epi || epi.sessionId !== view.sessionId) {
      var sid = view.sessionId;
      epi = { sessionId: sid, turns: null, loaded: false, deleted: false, played: false };
      var done = false;
      var finish = function (turns) {
        if (done) return;
        done = true;
        fateBusy = false;
        if (!epi || epi.sessionId !== sid) return;
        epi.turns = turns || null;
        epi.loaded = true;
        if (mode === 'game' && view.screen === 'epilogue') { renderEpilogue(opts); renderedKey = keyOf(); }
      };
      if (env.dbOk === false) finish(null);
      else {
        ST.getStoryTurns(sid).then(finish);
        setTimeout(function () { finish(null); }, 2500);
      }
      return;
    }
    if (!epi.loaded) return;
    var turnsById = {};
    (epi.turns || []).forEach(function (t) { turnsById[t.id] = t; });
    var w = view.world || {};
    var fate = view.chosenFate;
    var rows = view.album.map(function (a) {
      var rec = turnsById[a.turnId];
      var blob = !epi.deleted && rec && rec.audioBlob ? rec.audioBlob : null;
      var p = view.roster[a.playerIndex] || {};
      return {
        id: a.turnId, turnIndex: a.turnIndex, pi: a.playerIndex, label: a.label, icon: charIcon(p),
        promptText: a.promptText, inputMethod: a.inputMethod, blob: blob
      };
    });
    renderStory({
      mode: 'end',
      sessionId: view.sessionId,
      level: view.level,
      world: { title: w.title, text: w.text, questTitle: w.questTitle, quest: w.quest, icon: w.icon },
      fate: fate ? { type: fate.type, text: fate.text, closer: fate.closer } : null,
      tellers: view.roster.map(function (p, i) { return { label: p.label, icon: charIcon(p), pi: i }; }),
      turnsTold: view.counts.turnsTold,
      twists: view.counts.twists,
      rows: rows,
      hasNames: !epi.deleted && view.roster.some(function (p) { return !!p.nickname; }),
      deleted: epi.deleted,
      noSave: env.dbOk === false
    }, opts);
  }

  function lastStoryData() {
    var s = lastStory && lastStory.session;
    if (!s) return null;
    var world = s.builtWorld ? E.buildWorld(s.builtWorld, C) : findById(C.worlds, s.worldId);
    world = world || {};
    var fates = s.builtWorld ? (C.anyWorld && C.anyWorld.fates) : world.fates;
    var f = findById(fates, s.chosenFateId);
    var level = s.level === 'weaver' ? 'weaver' : 'sprout';
    var other = level === 'weaver' ? 'sprout' : 'weaver';
    var nick = [], chars = [];
    (lastStory.turns || []).forEach(function (t) {
      if (t.nickname) nick[t.playerIndex] = t.nickname;
      if (t.characterId) chars[t.playerIndex] = t.characterId;
    });
    var fake = { nicknames: nick, characterIds: chars };
    function label(i) { return E.labelFor(fake, i, C); }
    function iconFor(i) { var ch = findById(C.characters, chars[i]); return ch ? ch.icon : (UI_ICONS['player-n'] || 'ui-person'); }
    var seen = {}, tellers = [];
    (lastStory.turns || []).forEach(function (t) {
      if (!seen[t.playerIndex]) { seen[t.playerIndex] = true; tellers.push({ label: label(t.playerIndex), icon: iconFor(t.playerIndex), pi: t.playerIndex }); }
    });
    tellers.sort(function (a, b) { return a.pi - b.pi; });
    var rows = (lastStory.turns || []).map(function (t) {
      var pr = findById(C.prompts, t.promptId);
      return {
        id: t.id, turnIndex: t.turnIndex, pi: t.playerIndex, label: label(t.playerIndex), icon: iconFor(t.playerIndex),
        promptText: pr ? E.fillPrompt(pr.text, world) : '', inputMethod: t.inputMethod, blob: t.audioBlob || null
      };
    });
    return {
      mode: 'last',
      sessionId: s.sessionId,
      level: level,
      world: { title: world.title, text: world.world, questTitle: world.questTitle, quest: world.quest, icon: world.icon },
      fate: f ? { type: f.type, text: f[level] || f[other] || '', closer: f.closer || null } : null,
      tellers: tellers,
      turnsTold: rows.filter(function (r) { return r.inputMethod !== 'passed'; }).length,
      twists: (s.twistIds || []).length,
      rows: rows,
      hasNames: (lastStory.turns || []).some(function (t) { return !!t.nickname; }),
      deleted: false,
      noSave: false
    };
  }

  function renderLastStory(opts) {
    var data = lastStoryData();
    if (!data) { mode = 'game'; return renderSetup({ focusId: 'el-start' }); }
    renderStory(data, opts || {});
  }

  var storyData = null;
  function renderStory(d, opts) {
    storyData = d;
    stopPlayback();
    var hasAudio = !d.deleted && !d.noSave && d.rows.some(function (r) { return !!r.blob; });
    var h1 = h('h1', { tabindex: '-1', text: d.mode === 'last' ? T('last-story-heading') : T('epilogue-heading') });
    var content = [h1];
    var w = d.world;
    var cover = h('div', { class: 'cover' });
    // Story cover: compact cards (cards.css card--compact, no art window)
    cover.appendChild(cardEl({ type: 'world', title: w.title || '', text: w.text || '', mark: w.icon, compact: true, titleTag: 'h2' }));
    cover.appendChild(cardEl({ type: 'quest', title: w.questTitle || '', text: w.quest || '', mark: w.icon, compact: true, titleTag: 'h2' }));
    if (d.fate) {
      var ft = T(FATE_LABEL[d.fate.type] || 'fate-solved');
      cover.appendChild(cardEl({ type: 'fate', title: ft, text: d.fate.text, mark: w.icon, compact: true, say: 'hear-fate', sayText: lead(ft) + d.fate.text, titleTag: 'h2' }));
    }
    cover.appendChild(h('ul', { class: 'tellers' }, d.tellers.map(function (t) {
      return h('li', { class: 'pc-' + (t.pi + 1) }, icon(t.icon, 'face'), h('span', { class: 'nm' }, dotted(t.label)), icon(shapeId(t.pi), 'sh'));
    })));
    if (d.turnsTold) cover.appendChild(h('p', { class: 'counts', text: T('turns-told', { n: d.turnsTold }) }));
    if (d.twists) cover.appendChild(h('p', { class: 'counts', text: d.twists === 1 ? T('epilogue-twists-one') : T('epilogue-twists-other', { n: d.twists }) }));
    content.push(cover);
    if (d.mode === 'end' && d.fate && d.fate.closer) {
      content.push(h('div', { class: 'closer' },
        h('p', null, h('strong', { text: T('closer-label') + ' ' }), sayOnTap(h('span', { text: d.fate.closer }), d.fate.closer)),
        hearBtn('hear-question', d.fate.closer)));
    }
    var deletedLine = null;
    if (d.deleted) { deletedLine = noteEl('deleted', { id: 'el-deleted', focusable: true }); content.push(deletedLine); }
    else if (d.noSave) content.push(noteEl('no-save'));
    else if (!hasAudio) content.push(noteEl('no-audio-story'));

    // Album: each turn's prompt and teller (A-11 mitigation)
    content.push(h('h2', { class: 'sh2', text: T('album-heading') }));
    content.push(h('ol', { class: 'alb', id: 'el-album' }, d.rows.map(function (r) {
      var row = h('li', { class: 'pc-' + (r.pi + 1), id: 'el-row-' + r.turnIndex, 'data-turn': r.id },
        icon(r.icon, 'face'),
        h('div', { class: 'al' },
          h('span', { class: 'at' }, dotted(T('album-turn', { n: r.turnIndex, label: r.label }))),
          h('span', { class: 'ap', text: r.promptText })),
        h('span', { class: 'plg', hidden: true, text: T('now-playing') }));
      if (hasAudio && r.blob) {
        var pb = h('button', { type: 'button', class: 'tool ic rowplay', 'aria-label': T('play-turn', { n: r.turnIndex, label: r.label }) }, icon(UI_ICONS['play-turn'] || 'ui-play'));
        pb.addEventListener('click', function () { startPlayback('one', r); });
        row.appendChild(pb);
      } else {
        row.appendChild(h('span', { class: 'st', text: r.inputMethod === 'passed' ? T('passed-label') : T('told-out-loud') }));
      }
      return row;
    })));

    var dockKids = [];
    if (hasAudio) dockKids.push(h('div', { class: 'player', id: 'el-player' }));
    else if (d.mode === 'end') dockKids.push(kidBtn('play-again', playAnother, { cls: 'b-go wide', icon: 'ui-continue', id: 'el-again' }));
    if (hasAudio && d.mode === 'end') {
      content.push(h('div', { class: 'acts one', id: 'el-again-inline' },
        kidBtn('play-again', playAnother, { cls: 'b-sec wide', icon: 'ui-continue', id: 'el-again' })));
    }
    if (!d.noSave && (hasAudio || d.hasNames)) {
      content.push(h('hr', { class: 'div' }));
      var del = h('button', { type: 'button', class: 'lnk danger', id: 'el-del' }, ico('delete-audio'), ' ', T('delete-audio'));
      del.addEventListener('click', function () { openDeleteConfirm(del, d.mode); });
      content.push(h('div', { class: 'delrow' }, del));
    }
    var hdr = d.mode === 'last'
      ? h('header', { class: 'top' }, h('div', { class: 'toprow' }, toolBtn('back', function () {
        stopPlayback();
        mode = 'game';
        sync({ full: true, focusId: 'el-last-listen' });
      }, { id: 'el-back' })))
      : titleHeader();
    screen(d.mode === 'last' ? 'S1c' : 'E1', {
      header: hdr, content: content, dock: dockKids.length ? dockEl(dockKids) : null,
      focus: opts.focus === 'deleted' && deletedLine ? deletedLine : null
    });
    if (hasAudio) renderPlayer(false);
    if (opts.announce) announce(T(opts.announce), 400);
  }

  function playAnother() {
    stopPlayback();
    if (!dispatch({ type: A.RESTART }, { full: true })) { mode = 'game'; sync({ full: true }); }
  }

  // ---- playback (Listen in the pinned bar: Listen -> Pause/Play toggle, Next, Stop) ----

  function audioRows() { return storyData ? storyData.rows.filter(function (r) { return !!r.blob; }) : []; }

  function renderPlayer(focusToggle) {
    var box = $('el-player');
    if (!box) return;
    box.textContent = '';
    var toggle;
    if (!playback) {
      var again = epi && storyData && storyData.mode === 'end' ? epi.played : !!(storyData && storyData.played);
      toggle = kidBtn(again ? 'listen-again' : 'listen', function () { startPlayback('all', null); },
        { cls: 'b-go wide', id: 'el-listen', noGuard: true });
      box.appendChild(toggle);
      if (again && storyData.mode === 'end') {
        var inl = $('el-again-inline');
        if (inl) {
          if (inl.contains(doc.activeElement)) focusToggle = true;
          inl.remove();
        }
        box.appendChild(kidBtn('play-again', playAnother, { cls: 'b-sec wide', icon: 'ui-continue', id: 'el-again' }));
      }
    } else {
      var row = findRow(playback.rowId);
      if (row) box.appendChild(h('p', { class: 'nowp' }, h('span', { class: 'plg', text: T('now-playing') }), ' ',
        h('span', null, dotted(T('album-turn', { n: row.turnIndex, label: row.label })))));
      var paused = !!playback.paused;
      toggle = h('button', { type: 'button', class: 'btn kid b-go', id: 'el-listen' },
        icon(paused ? 'ui-play' : 'ui-pause'), h('span', { class: 'lbl', text: T(paused ? 'play-label' : 'pause-label') }));
      toggle.addEventListener('click', function () {
        if (!playback) return;
        if (playback.paused) { playback.paused = false; AU.resume(); renderPlayer(true); }
        else { playback.paused = true; AU.pause(); renderPlayer(true); }
      });
      var nextB = toolBtn('next-label', function () { AU.next(); }, { id: 'el-next' });
      var stopB = toolBtn('stop-label', function () { AU.stop(); focusEl($('el-listen')); }, { id: 'el-stop' });
      box.appendChild(h('div', { class: 'pctl' }, toggle, playback.kind === 'all' ? nextB : null, stopB));
    }
    watchDock();
    if (focusToggle) focusEl($('el-listen'));
  }

  function findRow(id) {
    var rows = storyData ? storyData.rows : [];
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }

  function markRow(id) {
    var list = doc.querySelectorAll('#el-album li');
    for (var i = 0; i < list.length; i++) {
      var li = list[i];
      var on = li.getAttribute('data-turn') === id;
      li.classList.toggle('playing', on);
      if (on) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
      var tag = li.querySelector('.plg');
      if (tag) tag.hidden = !on;
    }
  }

  function startPlayback(kind, row) {
    stopSpeakingUi();
    var focusWasToggle = doc.activeElement && doc.activeElement.id === 'el-listen';
    var mine = { kind: kind, rowId: row ? row.id : null, count: 0 };
    AU.stop();
    playback = mine;
    var onEnd = function () {
      if (playback !== mine) return;
      playback = null;
      markRow(null);
      if (storyData) {
        storyData.played = true;
        if (storyData.mode === 'end' && epi) epi.played = true;
      }
      var inPlayer = doc.activeElement && doc.activeElement.closest && doc.activeElement.closest('#el-player');
      renderPlayer(!!inPlayer || !doc.activeElement || doc.activeElement === doc.body);
    };
    if (kind === 'one' && row) {
      markRow(row.id);
      renderPlayer(false);
      AU.playOne(row.blob, { onEnd: onEnd }).then(function (ok) { if (!ok && playback === mine) onEnd(); });
      return;
    }
    var items = audioRows().map(function (r) { return { blob: r.blob, rowId: r.id }; });
    AU.playStory(items, {
      onItem: function (item) {
        if (playback !== mine) return;
        mine.paused = false;
        mine.rowId = item.rowId;
        mine.count += 1;
        markRow(item.rowId);
        renderPlayer(mine.count === 1 && focusWasToggle);
        var r = findRow(item.rowId);
        // Announce only a clip that starts by itself (a11y §2.2).
        if (r && mine.count > 1) announce(plainForSpeech(T('album-turn', { n: r.turnIndex, label: r.label })));
      },
      onEnd: onEnd
    }).then(function (ok) { if (!ok && playback === mine) onEnd(); });
  }

  function stopPlayback() {
    if (playback) { playback = null; AU.stop(); markRow(null); }
  }

  // ------------------------------------------------------------------ dialogs (native <dialog>)

  /** o: {cls, heading (node), body (nodes), focus (el), onCancel, returnTo} */
  function openDialog(o) {
    var hid = nextId('dlg-h');
    var heading = o.heading;
    heading.id = hid;
    heading.setAttribute('tabindex', '-1');
    var d = h('dialog', { class: 'dlg ' + (o.cls || ''), 'aria-labelledby': hid, 'aria-describedby': o.descId || null });
    add(d, [heading].concat(o.body || []));
    doc.body.appendChild(d);
    var rec = { el: d, returnTo: o.returnTo || doc.activeElement, onCancel: o.onCancel };
    d.addEventListener('cancel', function (e) {
      e.preventDefault();
      if (rec.onCancel) rec.onCancel(); else closeDialog(rec);
    });
    try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
    dialogs.push(rec);
    syncGuard();
    focusEl(o.focus || heading);
    return rec;
  }

  /** Close; focus goes to `focusTo`, else the opener, else the screen's target. false = leave it. */
  function closeDialog(rec, focusTo) {
    if (!rec) return;
    try { rec.el.close(); } catch (e) { /* ignore */ }
    if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
    dialogs = dialogs.filter(function (x) { return x !== rec; });
    if (focusTo === false) return;
    var t = focusTo || (rec.returnTo && rec.returnTo.isConnected ? rec.returnTo : null) || currentFocus;
    if (t && t.isConnected) focusEl(t);
    else if (currentFocus) focusEl(currentFocus);
  }

  // ---- T1m Grown-up help: microphone ----------------------------------------------

  function openMicAsk() {
    micAskOpen = true;
    syncTicker();
    var recBtn = $('el-rec');
    var descId = nextId('dlg-d');
    var rec;
    function notNow() {
      micAskOpen = false;
      closeDialog(rec, $('el-rec'));
      syncTicker();
    }
    var ok = kidBtn('ok', function () {
      story.micAskDone = true;
      micAskOpen = false;
      closeDialog(rec, $('el-rec'));
      beginRecording();
    }, { cls: 'b-go wide', icon: false, noGuard: true });
    var later = toolBtn('not-now', notNow, { cls: 'far' });
    rec = openDialog({
      cls: 'micask',
      heading: h('h2', null, ico('mic-ask-title'), ' ', T('mic-ask-title')),
      descId: descId,
      body: [h('div', { id: descId, class: 'dlg-text' }, h('p', { text: T('mic-ask-text') }), h('p', { class: 'strong', text: T('mic-ask-allow') })), ok, later],
      returnTo: recBtn,
      onCancel: notNow
    });
  }

  // ---- O1 Pause ----------------------------------------------------------------------

  function doPause() {
    if (!view || !view.can[A.PAUSE]) return;
    stopSpeakingUi();
    if (pendingStart) AU.stopRecording();            // cancels the permission wait ("cancelled")
    var wasRec = view.turnState === 'TURN_RECORDING';
    var snapNeeded = wasRec;
    dispatch({ type: A.PAUSE });
    if (snapNeeded) stopAndSave({});                  // engine moved to TURN_SAVING; save the clip
  }

  function syncPause() {
    var want = mode === 'game' && !!(view && view.paused);
    if (want && !pauseRec) {
      if (sheetRec) { closeDialog(sheetRec, false); sheetRec = null; }
      var keep = kidBtn('keep-going', doResume, { cls: 'b-go wide', id: 'el-resume', noGuard: true });
      pauseRec = openDialog({
        cls: 'pause',
        heading: h('h2', null, ico('pause'), ' ', T('pause')),
        body: [keep],
        returnTo: null,
        onCancel: doResume
      });
    } else if (!want && pauseRec) {
      var r = pauseRec;
      pauseRec = null;
      var target = view && view.screen === 'turn' ? $('el-prompt') : currentFocus;
      closeDialog(r, target || currentFocus);
    }
  }

  function doResume() {
    if (!dispatch({ type: A.RESUME })) {
      if (pauseRec) { var r = pauseRec; pauseRec = null; closeDialog(r); }
    }
  }

  // ---- O2 Grown-up tools ------------------------------------------------------------------

  function toolContext() {
    var s = view.screen;
    var recLike = s === 'recording' || s === 'saving' || pendingStart;
    return {
      screen: s,
      recLike: recLike,
      pause: !!view.can[A.PAUSE],
      replace: s === 'turn' || s === 'recording' || s === 'saving',
      pass: s === 'handover' || s === 'turn' || s === 'recording' || s === 'saving',
      soften: !!(view.twist && view.twist.canSoften && (TURN_FAMILY[s] || s === 'handover' || s === 'twist')),
      stop: s !== 'fate' && !!IN_STORY[view.phase]
    };
  }

  /** The same tool list for the phone sheet and the tablet/laptop group. */
  function fillTools(container, where) {
    container.textContent = '';
    var c = toolContext();
    var whyId = 'el-why-' + where;
    var items = [];
    var rowCls = 'row';
    if (c.pause) items.push(toolBtn('pause-session', function () { toolAct('pause'); }, { cls: rowCls }));
    if (c.replace) {
      var rp = toolBtn('replace-prompt', function () { toolAct('replace'); }, { cls: rowCls });
      if (c.recLike || !view.can[A.REPLACE_PROMPT]) setDisabled(rp, true, c.recLike ? whyId : null);
      items.push(rp);
    }
    if (c.pass) {
      var ps = toolBtn('pass-turn', function () { toolAct('pass'); }, { cls: rowCls });
      if (c.recLike || !view.can[A.PASS]) setDisabled(ps, true, c.recLike ? whyId : null);
      items.push(ps);
    }
    if (c.soften) items.push(toolBtn('soften-twist', function () { toolAct('soften'); }, { cls: rowCls }));
    if (c.stop) items.push(toolBtn('stop-story', function (e) { toolAct('stop', e.currentTarget); }, { cls: rowCls + ' quiet danger' }));
    if (c.recLike && (c.replace || c.pass)) items.push(h('p', { class: 'why', id: whyId, text: T('stop-first') }));
    var meta = [];
    if (TURN_FAMILY[c.screen]) meta.push(h('span', { class: 'el-secs', text: secsText() }));
    if (view.round && IN_STORY[view.phase] && view.phase !== 'FATE_CHOICE') meta.push(h('span', { text: T('round-chip', { n: view.round, max: view.maxRounds }) }));
    if (view.storageFull) meta.push(h('span', { text: T('storage-full') }));
    if (meta.length) {
      var m = h('p', { class: 'meta' });
      meta.forEach(function (x, i) {
        if (i) m.appendChild(h('span', { class: 'sep', 'aria-hidden': 'true', text: ' · ' }));
        m.appendChild(x);
      });
      items.push(m);
    }
    add(container, items);
  }

  function secsText() {
    if (!view || !view.timer) return '';
    return view.timer.overtime ? T('over-time') : T('secs-left', { n: Math.max(0, view.secondsLeft) });
  }

  function refreshTools() {
    var bar = $('el-toolsbar');
    if (bar) {
      var hadFocus = bar.contains(doc.activeElement);
      fillTools(bar, 'bar');
      if (hadFocus && $('el-tools-btn')) { /* keep focus inside the bar on its first tool */
        var first = bar.querySelector('button');
        if (first) focusEl(first);
      }
    }
    if (sheetRec) {
      var list = sheetRec.el.querySelector('.sheet-list');
      if (list) fillTools(list, 'sheet');
    }
  }

  function refreshSecs() {
    var list = doc.querySelectorAll('.el-secs');
    for (var i = 0; i < list.length; i++) list[i].textContent = secsText();
  }

  function openTools(opener) {
    if (sheetRec) return;
    var list = h('div', { class: 'sheet-list' });
    fillTools(list, 'sheet');
    var rec;
    var close = toolBtn('close', function () { closeDialog(rec, opener); sheetRec = null; }, { iconOnly: true, label: T('close'), cls: 'ic' });
    var heading = h('h2', null, ico('tools'), ' ', T('tools'));
    rec = openDialog({
      cls: 'sheet',
      heading: heading,
      body: [list, h('div', { class: 'sheet-foot' }, close)],
      returnTo: opener,
      onCancel: function () { closeDialog(rec, opener); sheetRec = null; }
    });
    sheetRec = rec;
  }

  function closeSheetQuiet() {
    if (sheetRec) { var r = sheetRec; sheetRec = null; closeDialog(r, false); }
  }

  function toolAct(what, btnEl) {
    var fromSheet = !!sheetRec;
    closeSheetQuiet();
    if (what === 'pause') { doPause(); return; }
    if (what === 'replace') {
      if (dispatch({ type: A.REPLACE_PROMPT }, { full: true, focus: 'prompt', fade: true })) return;
      if (currentFocus) focusEl(currentFocus);
      return;
    }
    if (what === 'pass') { dispatch({ type: A.PASS }, { full: true }); return; }
    if (what === 'soften') { doSoften(); return; }
    if (what === 'stop') {
      var opener = fromSheet ? $('el-tools-btn') : btnEl;
      openStopConfirm(opener);
    }
  }

  function doSoften() {
    if (!view.twist || !view.twist.canSoften) return;
    dispatch({ type: A.SOFTEN_TWIST }, { full: true, focus: 'twist' });
  }

  // ---- O3 Delete the saved voices? ---------------------------------------------------------

  function openDeleteConfirm(opener, where) {
    var descId = nextId('dlg-d');
    var rec;
    var n = where === 'setup' && lastStory ? lastStory.savedCount || 1 : 1;
    var keep = toolBtn('keep', function () { closeDialog(rec, opener); }, { cls: 'def', icon: false });
    var del = toolBtn('delete', function () {
      closeDialog(rec, false);
      doDelete(where);
    }, { cls: 'danger' });
    rec = openDialog({
      cls: 'confirm',
      heading: h('h2', { text: T('delete-title') }),
      descId: descId,
      body: [h('p', { id: descId, text: n > 1 ? T('delete-all-confirm', { n: n }) : T('delete-confirm') }), h('div', { class: 'row2' }, del, keep)],
      focus: keep,
      returnTo: opener
    });
  }

  function doDelete(where) {
    stopPlayback();
    var many = where === 'setup' && lastStory && lastStory.savedCount > 1;
    var sid = where === 'end' ? view.sessionId : (lastStory && lastStory.session && lastStory.session.sessionId);
    if (!sid) return;
    // Setup's Delete clears every saved story (decision 2026-10-28); the story screens clear their own.
    var job = where === 'setup' ? ST.deleteAllSavedAudio() : ST.deleteStoryAudio(sid);
    job.then(function (ok) {
      if (!ok) { announce(T('delete-failed'), 400); return; }   // never claim a delete that failed
      ST.clearDraft();
      setup.names = ['', '', '', '', '', ''];
      if (where === 'end') {
        state = E.withoutNicknames(state);
        if (epi) epi.deleted = true;
        sync({ full: true, focus: 'deleted' });
        refreshLastStory();
        return;
      }
      refreshLastStory().then(function () {
        mode = 'game';
        sync({ full: true, announce: many ? 'deleted-all' : 'deleted' });
      });
    });
  }

  // ---- O4 Stop this story? -----------------------------------------------------------------

  function openStopConfirm(opener) {
    var descId = nextId('dlg-d');
    var rec;
    var keep = toolBtn('keep-playing', function () { closeDialog(rec, opener); }, { cls: 'def' });
    var yes = toolBtn('stop-story-yes', function () {
      closeDialog(rec, false);
      stopStory();
    }, { cls: 'danger' });
    rec = openDialog({
      cls: 'confirm',
      heading: h('h2', null, ico('stop-story'), ' ', T('stop-story')),
      descId: descId,
      body: [h('p', { id: descId, text: T('stop-story-confirm') }), h('div', { class: 'row2' }, yes, keep)],
      focus: keep,
      returnTo: opener
    });
  }

  /** Stop this story: if a clip is being recorded, stop and save it first, then ABANDON. */
  function stopStory() {
    if (pendingStart) AU.stopRecording();
    var p = Promise.resolve();
    if (view.turnState === 'TURN_RECORDING') p = stopAndSave({});
    else if (saving) p = saving;
    p.then(function () {
      stopPlayback();
      if (pauseRec) { var r = pauseRec; pauseRec = null; closeDialog(r, false); }
      mode = 'game';
      if (!dispatch({ type: A.ABANDON }, { full: true })) sync({ full: true });
    });
  }

  // ------------------------------------------------------------------ timer, wake lock, history

  function syncTicker() {
    var should = mode === 'game' && view && view.timer && view.timer.running && !pendingStart && !micAskOpen;
    if (should && !ticker) ticker = setInterval(onTick, 1000);
    else if (!should && ticker) { clearInterval(ticker); ticker = null; }
  }

  function onTick() {
    if (!view || !view.timer || !view.timer.running || pendingStart || micAskOpen || mode !== 'game') { syncTicker(); return; }
    var turnId = view.currentTurnId;
    dispatch({ type: A.TICK }, { noRender: true });
    updateTimer();
    refreshSecs();
    if (view.timer.overtime && !story.overtimeSaid[turnId]) {
      story.overtimeSaid[turnId] = true;
      announce(T('timer-done'));                  // the only timer announcement (a11y §2.2)
    }
  }

  function syncAwake() {
    var want = inStory() && !(view && view.paused);
    if (want === awakeWanted) return;
    awakeWanted = want;
    AU.keepAwake(want);
  }

  /** One extra history entry while a story or a dialog is open: Back closes the dialog
      or opens Pause instead of leaving the game (A-25). */
  function syncGuard() {
    if (guardOn || !(inStory() || dialogs.length)) return;
    try { history.pushState({ thenWhat: true }, ''); guardOn = true; } catch (e) { /* file:// may refuse */ }
  }

  function onPopState() {
    guardOn = false;
    var d = topDialog();
    if (d) {
      if (d === pauseRec) { /* Back on Pause stays paused */ }
      else if (d.onCancel) d.onCancel(); else closeDialog(d);
    } else if (inStory() && view.can[A.PAUSE] && !view.paused) {
      doPause();
    }
    syncGuard();
  }

  function hookGlobal() {
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', function (e) {
      if (view && (view.screen === 'recording' || view.screen === 'saving' || pendingStart)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState !== 'hidden') return;
      stopSpeakingUi();
      if (inStory() && view && TURN_FAMILY[view.screen] && view.can[A.PAUSE] && !view.paused) doPause();
    });
    window.addEventListener('resize', function () { watchDock(); });
  }

  function refreshLastStory() {
    if (env.dbOk === false || !ST.getLastSavedStory) { lastStory = null; fillLastSlot(); return Promise.resolve(); }
    return ST.getLastSavedStory().then(function (r) {
      // Never show the story that is still being played (the draft's session).
      var activeId = state && state.phase !== 'SETUP' ? state.sessionId : null;
      if (r && r.session && r.session.sessionId === activeId) r = null;
      lastStory = r || null;
      fillLastSlot();
    });
  }

  // ------------------------------------------------------------------ boot

  function start() {
    app = $('app');
    statusEl = $('status');
    if (!app || !E || !C || !ST || !AU) return;
    loadPrefsIntoSetup();
    env.canRec = AU.canRecord();
    state = E.createSession(null, C, rng);
    var draft = ST.loadDraft();
    var resumed = draft ? E.resumeDraft(draft.state, C) : null;
    if (draft && !resumed) ST.clearDraft();
    hookGlobal();
    if (AU.onDisconnect) AU.onDisconnect(onMicDisconnect);
    AU.canSpeak().then(function (ok) {
      env.tts = !!ok;
      root.classList.toggle('has-tts', env.tts);
    });
    var dbReady = ST.openDb().then(function (db) { env.dbOk = !!db; });
    if (resumed) {
      state = resumed;
      story = freshStoryFlags();
      story.startedAt = null;
      ST.getSession(resumed.sessionId).then(function (s) {
        story.startedAt = (s && s.startedAt) || nowIso();
      });
      mode = 'resume';
    }
    sync({ full: true });
    dbReady.then(function () {
      fillFootSlot();
      if (mode === 'game' && view && view.screen === 'turn' && !recordAllowed() && $('el-rec')) renderActs();
      return refreshLastStory();
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();

  return {
    start: start,
    announce: announce,
    // For checks and debugging only (not used by the game).
    _debug: function () {
      return { mode: mode, screen: view && view.screen, paused: view && view.paused, env: env, pendingStart: pendingStart, dialogs: dialogs.length };
    }
  };
})();
