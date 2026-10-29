/* Then What?! — content checks (DRD v1.1 §10.1 item 4).
   Usage: ThenWhat.contentTests(assert [, content])
     assert(condition, message) is called once per check; condition is a boolean.
     content defaults to ThenWhat.content.
   Runs in web/tests.html (engine runner) and standalone in web/content-check.html.
   Data only is checked here; no DOM, no storage, no network.
*/
window.ThenWhat = window.ThenWhat || {};

ThenWhat.contentTests = function (assert, content) {
  'use strict';
  var c = content || ThenWhat.content;

  /* ---------- reference lists ---------- */

  // Every <symbol> id in web/icons/icons.svg (74). Regenerate when the sprite changes:
  //   grep -o 'symbol id="[^"]*"' web/icons/icons.svg
  var SPRITE_IDS = [
    'ui-mic', 'ui-stop', 'ui-continue', 'ui-pass', 'ui-pause', 'ui-play', 'ui-next-track', 'ui-replace',
    'ui-soften', 'ui-stop-story', 'ui-tools', 'ui-listen', 'ui-read-aloud', 'ui-read-aloud-stop', 'ui-delete', 'ui-big-screen',
    'ui-back', 'ui-close', 'ui-check', 'ui-minus', 'ui-plus', 'ui-person', 'ui-players', 'ui-phone', 'ui-dice',
    'card-world', 'card-quest', 'card-prompt', 'card-twist', 'card-fate',
    'world-school', 'world-jungle', 'world-lantern',
    'where-city', 'where-jungle', 'where-desert', 'where-forest', 'where-space', 'where-under-the-sea',
    'where-school', 'where-museum', 'where-circus', 'where-spooky-house',
    'when-long-ago', 'when-today', 'when-future',
    'kind-adventure', 'kind-mystery', 'kind-funny', 'kind-fairy-tale', 'kind-superhero', 'kind-space-story',
    'quest-find-lost', 'quest-new-friend', 'quest-deliver', 'quest-solve-mystery', 'quest-fix-broken',
    'quest-big-party',
    'char-inventor', 'char-animal-friend', 'char-brave-beginner', 'char-secret-keeper', 'char-snack-chef',
    'char-map-maker', 'char-shortcut-finder', 'char-kind-helper',
    'shape-circle', 'shape-triangle', 'shape-square', 'shape-diamond', 'shape-star', 'shape-heart',
    'level-sprout', 'level-weaver'
  ];

  // ui keys the screen flow (design/2026-10-21-screen-flow.md §9 C1), the accessibility pass
  // (design/2026-10-22-accessibility-pass.md §11) and the mockup (design/mockup/mockup.js) use.
  // Source: content doc §6, §6.1, §6.2.
  var REQUIRED_UI_KEYS = [
    // §6 table microcopy
    'turn-start', 'pass', 'timer-done', 'twist-banner-title', 'twist-banner-guide', 'soften-done', 'record',
    'recording', 'auto-stop', 'continue-no-rec', 'mic-blocked', 'mic-missing', 'told-out-loud', 'pause',
    'resume', 'fate-heading', 'epilogue-heading', 'listen', 'delete-audio', 'delete-confirm', 'last-story',
    'play-again',
    // §6.1 setup
    'level-heading', 'level-sprout', 'level-weaver', 'world-heading', 'pick-world', 'picked', 'spooky-level',
    'players-heading', 'characters-help', 'names-toggle', 'name-hint', 'names-privacy', 'big-screen', 'start',
    'no-save', 'step-of', 'back', 'use-world', 'change', 'last-story-heading',
    // §6.1 welcome back, hand-over, turn
    'round-chip', 'keep-going', 'resume-new', 'first-turn', 'hand-phone', 'ready', 'mic-stopped',
    'storage-full', 'quest-label', 'spark-label', 'timer-plenty', 'stop', 'saving', 'mic-ask-title',
    'mic-ask-text', 'ok', 'not-now',
    // §6.1 round break, Fate, Your story
    'round-done', 'last-round', 'fate-middle', 'fate-solved', 'fate-changed', 'fate-continued', 'our-pick',
    'fate-confirm', 'turns-told', 'closer-label', 'album-turn', 'passed-label', 'no-audio-story', 'deleted',
    'play-label', 'pause-label', 'next-label', 'stop-label', 'delete-title', 'delete', 'keep',
    // §6.1 grown-up tools and stop confirm
    'tools', 'pause-session', 'replace-prompt', 'pass-turn', 'soften-twist', 'stop-story', 'stop-first',
    'secs-left', 'over-time', 'close', 'stop-story-confirm', 'stop-story-yes', 'keep-playing',
    // §6.2 accessibility pass and card types
    'app-title', 'setup-heading', 'use-characters', 'player-n', 'fewer-players', 'more-players',
    'players-count', 'players-min', 'players-max', 'card-style', 'style-lantern', 'style-collectible',
    'style-sticker', 'change-world', 'last-listen', 'last-delete', 'surprise-me', 'build-progress',
    'build-result-heading', 'type-world', 'type-quest', 'type-prompt', 'type-twist', 'type-fate',
    'turn-order', 'now-label', 'hear-heading', 'hear-world', 'hear-quest', 'hear-step', 'hear-pass',
    'hear-spark', 'hear-prompt', 'hear-twist', 'hear-fate', 'hear-question', 'stop-hearing',
    'stop-recording', 'pick-ending-first', 'ending-picked', 'album-heading', 'play-turn', 'now-playing',
    'epilogue-twists-one', 'epilogue-twists-other', 'mic-ask-allow',
    // §6.2 keys added 2026-10-23 (mockup record §5 item 3)
    'build-world', 'q-where', 'q-when', 'q-kind', 'q-quest', 'table-call', 'listen-again'
  ];

  // Placeholders a ui string may contain (content doc §6.1 notes, DRD §3.1).
  var UI_PLACEHOLDERS = ['[name]', '[n]', '[max]', '[label]', '[type]'];
  // Placeholders the builder templates may contain (content doc §4.5).
  var TEMPLATE_FIELDS = ['{where.label}', '{where.phrase}', '{when.label}', '{when.phrase}',
    '{kind.label}', '{kind.phrase}', '{mission.questTitle}', '{mission.questText}', '{mission.label}'];

  // Excluded themes (content doc §7, DRD §3.1). Whole words, case-insensitive.
  var EXCLUDED_WORDS = [
    // horror
    'horror', 'horrible', 'gore', 'gory', 'monster', 'monsters', 'zombie', 'zombies', 'vampire', 'demon',
    'curse', 'cursed', 'nightmare', 'haunted', 'scream', 'screams', 'terror', 'terrifying', 'creepy',
    // war, weapons, fighting
    'war', 'wars', 'battle', 'battles', 'army', 'soldier', 'soldiers', 'weapon', 'weapons', 'gun', 'guns',
    'sword', 'swords', 'bomb', 'fight', 'fights', 'fighting', 'attack', 'attacks',
    // pandemic, illness, injury, disaster victims
    'pandemic', 'virus', 'plague', 'disease', 'sick', 'illness', 'injury', 'injured', 'hurt', 'wounded',
    'blood', 'bloody', 'bleeding',
    // death
    'death', 'dead', 'die', 'dies', 'died', 'dying', 'kill', 'kills', 'killed', 'killing', 'murder', 'grave',
    'funeral',
    // dystopia, cruelty, captivity
    'dystopia', 'dystopian', 'tyrant', 'cruel', 'kidnap', 'kidnapped', 'prison', 'jail',
    'trapped', 'villain', 'evil',
    // stranger-trust and meanness
    'stranger', 'strangers', 'stupid', 'dumb', 'loser', 'hate',
    // scary-alone situations (Sprout rule, applied everywhere)
    'alone', 'scary', 'abandoned', 'lonely'
  ];
  var EXCLUDED_PHRASES = ['in the dark', 'locked in', 'locked up', 'all by yourself', 'no way out',
    'lost forever', 'never come back'];
  // Words players never see (content doc §6.1). Ids and keys may use them; strings may not.
  var HIDDEN_WORDS = ['relay', 'epilogue', 'kids', 'session', 'fate', 'fates'];

  var LEVELS = ['sprout', 'weaver'];
  var FATE_ORDER = ['solved', 'changed', 'to-be-continued'];
  var CATEGORIES = ['object', 'obstacle', 'choice', 'ally', 'sensory', 'consequence', 'thread-recall'];
  var WORLD_TYPES = ['everyday', 'real-adventure', 'fantasy'];
  var ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  /* ---------- helpers ---------- */

  function has(list, v) { return list.indexOf(v) !== -1; }
  function isStr(s) { return typeof s === 'string' && s.trim().length > 0; }
  function words(s) { return String(s).trim().split(/\s+/).length; }
  function len(s, min, max) { return isStr(s) && s.length >= min && s.length <= max; }
  function check(cond, msg) { assert(!!cond, msg); }

  // Every string value in the content, with a path for messages.
  function eachString(obj, path, fn) {
    if (typeof obj === 'string') { fn(obj, path); return; }
    if (Array.isArray(obj)) { obj.forEach(function (v, i) { eachString(v, path + '[' + i + ']', fn); }); return; }
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(function (k) { eachString(obj[k], path + '.' + k, fn); });
    }
  }
  // Fields that hold ids or other code values, not text people see.
  function isCodePath(path) {
    return /\.(id|icon|type|kind|worldType|category|level|source|version)$/.test(path) ||
      /\.levels\[\d+\]$/.test(path) || /^content\.uiIcons\./.test(path) ||
      /\.(ages)$/.test(path);
  }

  function hasEmoji(s) {
    for (var i = 0; i < s.length; i++) {
      var cp = s.codePointAt(i);
      if (cp > 0xffff) i++;
      if (cp >= 0x1f000) return true;
      if (cp >= 0x2600 && cp <= 0x27bf) return true;   // misc symbols, dingbats (incl. U+2713 check mark)
      if (cp === 0xfe0f || cp === 0x2713 || cp === 0x2714 || cp === 0x2705 || cp === 0x200d) return true;
      if (cp >= 0x2b00 && cp <= 0x2bff) return true;   // stars, arrows used as emoji
    }
    return false;
  }

  function excludedHit(s) {
    var lower = s.toLowerCase();
    for (var i = 0; i < EXCLUDED_WORDS.length; i++) {
      var re = new RegExp('(^|[^a-z-])' + EXCLUDED_WORDS[i].replace(/-/g, '\\-') + '($|[^a-z-])');
      if (re.test(lower)) return EXCLUDED_WORDS[i];
    }
    for (var j = 0; j < EXCLUDED_PHRASES.length; j++) {
      if (lower.indexOf(EXCLUDED_PHRASES[j]) !== -1) return EXCLUDED_PHRASES[j];
    }
    return null;
  }

  function hiddenHit(s) {
    var lower = s.toLowerCase();
    for (var i = 0; i < HIDDEN_WORDS.length; i++) {
      if (new RegExp('(^|[^a-z])' + HIDDEN_WORDS[i] + '($|[^a-z])').test(lower)) return HIDDEN_WORDS[i];
    }
    return null;
  }

  // Brackets must be balanced and every [x] must be an allowed placeholder.
  function placeholdersOk(s, allowed, open, close) {
    var depth = 0, i;
    for (i = 0; i < s.length; i++) {
      if (s[i] === open) { depth++; if (depth > 1) return false; }
      if (s[i] === close) { depth--; if (depth < 0) return false; }
    }
    if (depth !== 0) return false;
    var re = open === '[' ? /\[[^\]]*\]/g : /\{[^}]*\}/g;
    var found = s.match(re) || [];
    for (i = 0; i < found.length; i++) if (!has(allowed, found[i])) return false;
    return true;
  }

  function checkTwist(t, where) {
    check(t && ID_RE.test(t.id), where + ': Twist id is lowercase-kebab (' + (t && t.id) + ')');
    check(len(t.name, 3, 40), where + ' ' + t.id + ': name 3-40 chars');
    check(len(t.sprout, 10, 120), where + ' ' + t.id + ': Sprout text present, 10-120 chars');
    check(len(t.weaver, 10, 120), where + ' ' + t.id + ': Weaver text present, 10-120 chars');
    check(words(t.sprout) <= 14, where + ' ' + t.id + ': Sprout Twist <= 14 words (' + words(t.sprout) + ')');
    check(words(t.weaver) <= 22, where + ' ' + t.id + ': Weaver Twist <= 22 words (' + words(t.weaver) + ')');
  }

  function checkFates(fates, where) {
    check(Array.isArray(fates) && fates.length === 3, where + ': exactly 3 Fates');
    if (!Array.isArray(fates)) return;
    var types = fates.map(function (f) { return f.type; });
    check(FATE_ORDER.every(function (t) { return types.filter(function (x) { return x === t; }).length === 1; }),
      where + ': one Fate of each type (solved, changed, to-be-continued)');
    check(types.join() === FATE_ORDER.join(), where + ': Fates in DRD §5.3 order');
    fates.forEach(function (f) {
      check(ID_RE.test(f.id), where + ': Fate id is lowercase-kebab (' + f.id + ')');
      check(len(f.sprout, 10, 140), where + ' ' + f.id + ': Sprout text present, 10-140 chars');
      check(len(f.weaver, 10, 140), where + ' ' + f.id + ': Weaver text present, 10-140 chars');
      // Word caps apply to Fates as well as Twists (content doc §0, §7; decided 2026-10-23).
      check(words(f.sprout) <= 14, where + ' ' + f.id + ': Sprout Fate <= 14 words (' + words(f.sprout) + ')');
      check(words(f.weaver) <= 22, where + ' ' + f.id + ': Weaver Fate <= 22 words (' + words(f.weaver) + ')');
      check(f.closer === undefined || len(f.closer, 5, 80), where + ' ' + f.id + ': closer <= 80 chars');
    });
  }

  function questTitleOk(s) { return len(s, 3, 30) && words(s) >= 2 && words(s) <= 4; }
  // questGoal fills {quest} in prompts (decision 2026-10-29): a lowercase verb phrase.
  function questGoalOk(s) { return len(s, 5, 30) && words(s) >= 2 && words(s) <= 4 && s === s.toLowerCase(); }

  /* ---------- 1. top level ---------- */

  check(c && typeof c === 'object', 'ThenWhat.content exists');
  if (!c) return;
  ['version', 'levels', 'worlds', 'prompts', 'characters', 'builder', 'anyWorld', 'ui', 'uiIcons']
    .forEach(function (k) { check(k in c, 'content has "' + k + '"'); });
  check(c.version === 'base-1.0', 'version is base-1.0');
  check(JSON.stringify(JSON.parse(JSON.stringify(c))) === JSON.stringify(c),
    'content is plain JSON (survives a JSON round trip)');
  var fnFound = false;
  (function walk(o) {
    if (typeof o === 'function') fnFound = true;
    else if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { walk(o[k]); });
  })(c);
  check(!fnFound, 'content holds no functions');

  /* ---------- 2. levels (DRD §2.3) ---------- */

  var L = c.levels || {};
  check(L.sprout && L.sprout.maxRounds === 4 && L.sprout.turnSeconds === 30,
    'sprout: 4 rounds, 30 seconds');
  check(L.sprout && JSON.stringify(L.sprout.twistWindows) === '[2,3]' &&
    L.sprout.minTwists === 1 && L.sprout.maxTwists === 1, 'sprout: Twist windows [2,3], exactly 1 Twist');
  check(L.weaver && L.weaver.maxRounds === 5 && L.weaver.turnSeconds === 45,
    'weaver: 5 rounds, 45 seconds');
  check(L.weaver && JSON.stringify(L.weaver.twistWindows) === '[2,3,4]' &&
    L.weaver.minTwists === 1 && L.weaver.maxTwists === 2, 'weaver: Twist windows [2,3,4], 1-2 Twists');
  check(Object.keys(L).sort().join() === 'sprout,weaver', 'only two levels in the base game');

  /* ---------- 3. ready-made worlds ---------- */

  check(Array.isArray(c.worlds) && c.worlds.length === 3, 'exactly 3 ready-made worlds');
  (c.worlds || []).forEach(function (w) {
    var at = 'world ' + w.id;
    check(ID_RE.test(w.id), at + ': id is lowercase-kebab');
    check(len(w.title, 3, 50), at + ': title 3-50 chars');
    check(w.kind === 'ready-made', at + ': kind is ready-made');
    check(has(WORLD_TYPES, w.worldType), at + ': worldType is everyday / real-adventure / fantasy');
    check(len(w.world, 10, 160), at + ': world text 10-160 chars');
    check(len(w.quest, 10, 160), at + ': quest text 10-160 chars');
    check(len(w.spark, 10, 100), at + ': spark 10-100 chars');
    check(questTitleOk(w.questTitle), at + ': questTitle is 2-4 words, <= 30 chars');
    check(questGoalOk(w.questGoal), at + ': questGoal is 2-4 lowercase words');
    check(Array.isArray(w.twists) && w.twists.length >= 4, at + ': at least 4 Twists');
    (w.twists || []).forEach(function (t) { checkTwist(t, at); });
    check(w.softenTwist && !Array.isArray(w.softenTwist) && typeof w.softenTwist === 'object',
      at + ': exactly 1 softenTwist (an object, not a list)');
    if (w.softenTwist) checkTwist(w.softenTwist, at + ' soften');
    checkFates(w.fates, at);
  });

  /* ---------- 4. prompts ---------- */

  var prompts = c.prompts || [];
  LEVELS.forEach(function (lv) {
    var pool = prompts.filter(function (p) { return p.level === lv || p.level === 'all'; });
    check(pool.length >= 12, lv + ': at least 12 prompts (' + pool.length + ')');
  });
  // Story stages (decision 2026-10-29): every prompt is tagged; each stage has enough to draw from.
  var STAGES = ['begin', 'middle', 'end', 'twist', 'final'];
  var longestGoal = 'go find it now';   // questGoalOk allows at most 4 words
  LEVELS.forEach(function (lv) {
    STAGES.forEach(function (st) {
      var n = prompts.filter(function (p) { return (p.level === lv || p.level === 'all') && (p.stages || []).indexOf(st) >= 0; }).length;
      check(n >= (st === 'twist' || st === 'final' ? 2 : 5), lv + ': ' + st + ' stage has enough prompts (' + n + ')');
    });
  });
  prompts.forEach(function (p) {
    var at = 'prompt ' + p.id;
    check(Array.isArray(p.stages) && p.stages.length > 0 && p.stages.every(function (x) { return has(STAGES, x); }), at + ': stages are begin / middle / end / twist / final');
    var placeholders = String(p.text).match(/\{[^}]*\}/g) || [];
    check(placeholders.every(function (x) { return x === '{quest}'; }), at + ': only the {quest} placeholder');
    var filled = String(p.text).split('{quest}').join(longestGoal);
    if (p.level === 'sprout') check(words(filled) <= 12, at + ': Sprout prompt <= 12 words with the longest quest goal');
    if (p.level === 'weaver') check(words(filled) <= 20, at + ': Weaver prompt <= 20 words with the longest quest goal');
    check(ID_RE.test(p.id), at + ': id is lowercase-kebab');
    check(len(p.text, 10, 100), at + ': text 10-100 chars');
    check(has(CATEGORIES, p.category), at + ': category is valid (' + p.category + ')');
    check(has(['sprout', 'weaver', 'all'], p.level), at + ': level is sprout / weaver / all');
    check(typeof p.readingGrade === 'number' && p.readingGrade > 0, at + ': readingGrade is a number');
    if (p.level === 'sprout') {
      check(p.readingGrade <= 2, at + ': Sprout readingGrade <= 2 (' + p.readingGrade + ')');
      check(words(p.text) <= 12, at + ': Sprout prompt <= 12 words');
    }
    if (p.level === 'weaver') {
      check(p.readingGrade <= 5, at + ': Weaver readingGrade <= 5 (' + p.readingGrade + ')');
      check(words(p.text) <= 20, at + ': Weaver prompt <= 20 words');
    }
    check(p.source === undefined || /^P-\d+$/.test(p.source), at + ': source is a catalogue id');
  });

  /* ---------- 5. characters ---------- */

  var chars = c.characters || [];
  check(chars.length >= 6, 'at least 6 characters (' + chars.length + ')');
  chars.forEach(function (ch) {
    check(ID_RE.test(ch.id), 'character ' + ch.id + ': id is lowercase-kebab');
    check(len(ch.name, 3, 40), 'character ' + ch.id + ': name <= 40 chars');
    check(len(ch.trait, 5, 60), 'character ' + ch.id + ': trait <= 60 chars');
  });

  /* ---------- 6. Build a World ---------- */

  var b = c.builder || {};
  var expected = { where: 10, when: 3, kind: 6, mission: 6 };
  Object.keys(expected).forEach(function (list) {
    var items = b[list] || [];
    check(items.length === expected[list], 'builder.' + list + ' has ' + expected[list] + ' items');
    items.forEach(function (it) {
      var at = 'builder.' + list + ' ' + it.id;
      check(ID_RE.test(it.id), at + ': id is lowercase-kebab');
      check(len(it.label, 3, 40), at + ': label 3-40 chars');
      if (list === 'mission') {
        check(len(it.questText, 10, 160), at + ': questText 10-160 chars');
        check(questTitleOk(it.questTitle), at + ': questTitle is 2-4 words, <= 30 chars');
        check(questGoalOk(it.questGoal), at + ': questGoal is 2-4 lowercase words');
      } else {
        check(len(it.phrase, 3, 60), at + ': phrase present');
      }
      check(it.levels === undefined ||
        (Array.isArray(it.levels) && it.levels.length > 0 && it.levels.every(function (l) { return has(LEVELS, l); })),
        at + ': levels (if set) lists sprout / weaver');
    });
  });
  var spooky = (b.where || []).filter(function (it) { return it.id === 'spooky-house'; })[0];
  check(spooky && JSON.stringify(spooky.levels) === '["weaver"]', 'Spooky House is Tale Weaver only');
  ['worldTitleTemplate', 'worldTemplate', 'questTitleTemplate', 'questTemplate'].forEach(function (k) {
    check(isStr(b[k]) && placeholdersOk(b[k], TEMPLATE_FIELDS, '{', '}'),
      'builder.' + k + ' present with valid {list.field} placeholders');
  });
  // Every possible built world fits the length limits.
  function fill(tpl, pick) {
    return tpl.replace(/\{(\w+)\.(\w+)\}/g, function (_, list, field) { return pick[list][field]; });
  }
  var worst = { world: 0, title: 0, quest: 0, worldMin: 999 };
  (b.where || []).forEach(function (wh) {
    (b.when || []).forEach(function (wn) {
      (b.kind || []).forEach(function (k) {
        (b.mission || []).forEach(function (m) {
          var pick = { where: wh, when: wn, kind: k, mission: m };
          var wt = fill(b.worldTemplate, pick);
          worst.world = Math.max(worst.world, wt.length);
          worst.worldMin = Math.min(worst.worldMin, wt.length);
          worst.title = Math.max(worst.title, fill(b.worldTitleTemplate, pick).length);
          worst.quest = Math.max(worst.quest, fill(b.questTemplate, pick).length);
        });
      });
    });
  });
  check(worst.worldMin >= 10 && worst.world <= 160, 'every built world text is 10-160 chars (max ' + worst.world + ')');
  check(worst.title <= 50, 'every built world title <= 50 chars (max ' + worst.title + ')');
  check(worst.quest <= 160, 'every built quest text <= 160 chars (max ' + worst.quest + ')');

  /* ---------- 7. any-world set ---------- */

  var aw = c.anyWorld || {};
  check(Array.isArray(aw.twists) && aw.twists.length >= 8, 'anyWorld: at least 8 Twists');
  (aw.twists || []).forEach(function (t) { checkTwist(t, 'anyWorld'); });
  check(Array.isArray(aw.softenTwists) && aw.softenTwists.length >= 2, 'anyWorld: at least 2 Soften Twists');
  (aw.softenTwists || []).forEach(function (t) { checkTwist(t, 'anyWorld soften'); });
  checkFates(aw.fates, 'anyWorld');
  check(Array.isArray(aw.sparks) && aw.sparks.length >= 1 &&
    aw.sparks.every(function (s) { return len(s, 10, 100); }), 'anyWorld: sparks present, 10-100 chars');

  /* ---------- 8. ids unique ---------- */

  var seen = {}, dupes = [];
  function addId(id) { if (seen[id]) dupes.push(id); seen[id] = true; }
  (c.worlds || []).forEach(function (w) {
    addId(w.id);
    (w.twists || []).forEach(function (t) { addId(t.id); });
    if (w.softenTwist) addId(w.softenTwist.id);
    (w.fates || []).forEach(function (f) { addId(f.id); });
  });
  (aw.twists || []).concat(aw.softenTwists || [], aw.fates || []).forEach(function (t) { addId(t.id); });
  prompts.forEach(function (p) { addId(p.id); });
  chars.forEach(function (ch) { addId(ch.id); });
  check(dupes.length === 0, 'world, Twist, Fate, prompt and character ids are unique' +
    (dupes.length ? ' (dupes: ' + dupes.join(', ') + ')' : ''));
  Object.keys(expected).forEach(function (list) {
    var ids = (b[list] || []).map(function (it) { return it.id; });
    check(ids.length === ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length,
      'builder.' + list + ' ids are unique');
  });

  /* ---------- 9. ui strings ---------- */

  var ui = c.ui || {};
  var missing = REQUIRED_UI_KEYS.filter(function (k) { return !isStr(ui[k]); });
  check(missing.length === 0, 'every required ui key is present (' + REQUIRED_UI_KEYS.length + ')' +
    (missing.length ? ' missing: ' + missing.join(', ') : ''));
  Object.keys(ui).forEach(function (k) {
    check(ID_RE.test(k), 'ui key "' + k + '" is lowercase-kebab');
    check(typeof ui[k] === 'string', 'ui.' + k + ' is a plain string');
    check(typeof ui[k] === 'string' && placeholdersOk(ui[k], UI_PLACEHOLDERS, '[', ']'),
      'ui.' + k + ': placeholders well-formed (' + ui[k] + ')');
  });
  check(ui['epilogue-twists-one'] && ui['epilogue-twists-one'].indexOf('[n]') === -1 &&
    ui['epilogue-twists-other'] && ui['epilogue-twists-other'].indexOf('[n]') !== -1,
    'plural pair epilogue-twists-one / -other: only -other uses [n]');

  /* ---------- 10. icons ---------- */

  var icons = c.uiIcons || {};
  Object.keys(icons).forEach(function (k) {
    check(k in ui, 'uiIcons.' + k + ' names an existing ui key');
    check(has(SPRITE_IDS, icons[k]), 'uiIcons.' + k + ' = ' + icons[k] + ' exists in icons.svg');
  });
  var iconFields = [];
  (c.worlds || []).forEach(function (w) { iconFields.push(['world ' + w.id, w.icon]); });
  chars.forEach(function (ch) { iconFields.push(['character ' + ch.id, ch.icon]); });
  Object.keys(expected).forEach(function (list) {
    (b[list] || []).forEach(function (it) { iconFields.push(['builder.' + list + ' ' + it.id, it.icon]); });
  });
  iconFields.forEach(function (pair) {
    check(has(SPRITE_IDS, pair[1]), pair[0] + ': icon ' + pair[1] + ' exists in icons.svg');
  });

  /* ---------- 11. every string: emoji, themes, placeholders, hidden words ---------- */

  var emoji = [], themes = [], stray = [], hidden = [];
  eachString(c, 'content', function (s, path) {
    if (hasEmoji(s)) emoji.push(path);
    if (isCodePath(path)) return;
    var hit = excludedHit(s);
    if (hit) themes.push(path + ' ("' + hit + '")');
    var isUi = path.indexOf('content.ui.') === 0;
    var isTpl = /^content\.builder\.\w+Template$/.test(path);
    var isPrompt = /^content\.prompts\[\d+\]\.text$/.test(path);   // {quest} only, checked in section 4
    if (!isUi && !isTpl && /[\[\]{}]/.test(isPrompt ? s.split('{quest}').join('') : s)) stray.push(path);
    var h = hiddenHit(s);
    if (h) hidden.push(path + ' ("' + h + '")');
  });
  check(emoji.length === 0, 'no emoji or pictographic symbol in any string' +
    (emoji.length ? ': ' + emoji.join(', ') : ''));
  check(themes.length === 0, 'no excluded themes (horror, war, pandemic, death, dystopia, scary-alone)' +
    (themes.length ? ': ' + themes.join(', ') : ''));
  check(stray.length === 0, 'only ui strings, builder templates and {quest} in prompts contain placeholders' +
    (stray.length ? ': ' + stray.join(', ') : ''));
  check(hidden.length === 0, 'no string says Relay, Epilogue, kids, session or Fate' +
    (hidden.length ? ': ' + hidden.join(', ') : ''));
};
