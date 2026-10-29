/* ==========================================================================
   Then What?! — storage.js  ->  ThenWhat.storage
   Owner: Game Audio Engineer (storage)          Date: 2026-10-23
   Contract: docs/architecture/2026-10-23-phase-3-build-plan.md §3.3,
             DRD v1.1 §3.2 (schema), §8 (draft, quota, IndexedDB unavailable)
   Notes:    docs/architecture/2026-10-23-audio-storage-notes.md

   RULES
   - Everything stays on this device: IndexedDB + localStorage only.
     No fetch, XHR, WebSocket or beacon anywhere (DRD §9.1).
   - Every async function RESOLVES, never rejects. Failure -> null / false /
     {ok:false} plus a console.warn. Storage problems never stop the game.
   - Every localStorage access is wrapped in try/catch (private modes,
     blocked site data and sandboxed frames can throw on access).
   - No DOM access.
   ========================================================================== */
window.ThenWhat = window.ThenWhat || {};

(function (TW) {
  "use strict";

  var DB_NAME = "then_what";
  var DB_VERSION = 1;
  var STORE_SESSIONS = "sessions";
  var STORE_TURNS = "turns";
  var DRAFT_KEY = "then-what:draft";
  var PREFS_KEY = "then-what:prefs";
  var DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;   // DRD §8: 12 hours
  var CLOCK_SKEW_MS = 5 * 60 * 1000;            // a draft "from the future" beyond this is invalid
  var OPEN_TIMEOUT_MS = 4000;                   // some browsers never answer indexedDB.open

  // Allowed preference values. Anything else (names especially) is dropped.
  var PREF_RULES = {
    level: function (v) { return v === "sprout" || v === "weaver"; },
    playerCount: function (v) { return typeof v === "number" && v % 1 === 0 && v >= 2 && v <= 6; },
    useCharacters: function (v) { return typeof v === "boolean"; },
    cardStyle: function (v) { return v === "lantern" || v === "collectible" || v === "sticker"; },
    bigScreen: function (v) { return typeof v === "boolean"; }
  };

  function warn() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift("[ThenWhat.storage]");
      console.warn.apply(console, args);
    } catch (e) { /* console missing: ignore */ }
  }

  function errName(e) {
    return (e && e.name) || "Error";
  }

  // ------------------------------------------------------------------------
  // IndexedDB
  // ------------------------------------------------------------------------

  function getIdb() {
    try {
      return (typeof indexedDB !== "undefined" && indexedDB) ? indexedDB : null;
    } catch (e) {
      return null;   // some sandboxed frames throw a SecurityError on access
    }
  }

  /** True when the IndexedDB API exists. A true here can still be followed by
   *  openDb() resolving null (e.g. Firefox private windows before v115). */
  function isAvailable() {
    return !!getIdb();
  }

  var dbPromise = null;   // cached only while it holds a working connection

  /** Resolves the IDBDatabase, or null. Never rejects. */
  function openDb() {
    if (dbPromise) return dbPromise;
    var idb = getIdb();
    if (!idb) {
      warn("IndexedDB is not available");
      return Promise.resolve(null);
    }
    var p = new Promise(function (resolve) {
      var done = false;
      function finish(db) {
        if (done) {
          if (db) { try { db.close(); } catch (e) { /* ignore */ } }
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve(db);
      }
      var timer = setTimeout(function () {
        warn("indexedDB.open timed out");
        finish(null);
      }, OPEN_TIMEOUT_MS);

      var req;
      try {
        req = idb.open(DB_NAME, DB_VERSION);
      } catch (e) {
        warn("indexedDB.open threw", errName(e));
        finish(null);
        return;
      }
      req.onupgradeneeded = function () {
        try {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
            db.createObjectStore(STORE_SESSIONS, { keyPath: "sessionId" });
          }
          if (!db.objectStoreNames.contains(STORE_TURNS)) {
            var turns = db.createObjectStore(STORE_TURNS, { keyPath: "id" });
            turns.createIndex("sessionId", "sessionId", { unique: false });
          }
        } catch (e) {
          warn("upgrade failed", errName(e));
        }
      };
      req.onsuccess = function () {
        var db = req.result;
        // Another tab (a future version) wants to upgrade: let it.
        db.onversionchange = function () {
          try { db.close(); } catch (e) { /* ignore */ }
          dbPromise = null;
        };
        db.onclose = function () { dbPromise = null; };
        finish(db);
      };
      req.onerror = function (ev) {
        warn("indexedDB.open failed", errName(req.error));
        if (ev && ev.preventDefault) ev.preventDefault();
        finish(null);
      };
      req.onblocked = function () {
        warn("indexedDB.open blocked by another tab");
        // Keep waiting; the timeout resolves null if it never unblocks.
      };
    });
    dbPromise = p;
    p.then(function (db) { if (!db && dbPromise === p) dbPromise = null; });
    return p;
  }

  /** Runs fn(store, tx) inside one transaction. Resolves {ok, value, error}. */
  function withStore(storeName, mode, fn) {
    return openDb().then(function (db) {
      if (!db) return { ok: false, error: { name: "Unavailable" } };
      return new Promise(function (resolve) {
        var tx;
        var value;
        try {
          tx = db.transaction(storeName, mode);
        } catch (e) {
          // InvalidStateError: the connection was closed under us.
          dbPromise = null;
          resolve({ ok: false, error: e });
          return;
        }
        tx.oncomplete = function () { resolve({ ok: true, value: value }); };
        tx.onabort = function () { resolve({ ok: false, error: tx.error || { name: "AbortError" } }); };
        tx.onerror = function (ev) {
          // Let onabort report it; stop it bubbling to window.onerror.
          if (ev && ev.preventDefault) ev.preventDefault();
        };
        try {
          fn(tx.objectStore(storeName), function (v) { value = v; });
        } catch (e) {
          // Synchronous throw from put/get (e.g. DataCloneError).
          try { tx.abort(); } catch (e2) { /* already finished */ }
          resolve({ ok: false, error: e });
        }
      });
    }).catch(function (e) {
      warn("transaction failed", errName(e));
      return { ok: false, error: e };
    });
  }

  function isPlainRecord(rec) {
    return rec !== null && typeof rec === "object";
  }

  /** Resolves true / false. */
  function saveSession(rec) {
    if (!isPlainRecord(rec) || typeof rec.sessionId !== "string" || !rec.sessionId) {
      warn("saveSession: missing sessionId");
      return Promise.resolve(false);
    }
    return withStore(STORE_SESSIONS, "readwrite", function (store) {
      store.put(rec);
    }).then(function (r) {
      if (!r.ok) warn("saveSession failed", errName(r.error));
      return r.ok;
    });
  }

  function withoutAudio(rec) {
    var copy = {};
    for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k)) copy[k] = rec[k];
    copy.audioBlob = null;
    copy.audioByteSize = 0;
    copy.mimeType = null;
    return copy;
  }

  function putTurn(rec) {
    return withStore(STORE_TURNS, "readwrite", function (store) { store.put(rec); });
  }

  /** Old WebKit could not store a Blob in IndexedDB (DataCloneError).
   *  Fallback: store the bytes as an ArrayBuffer; getStoryTurns turns it back
   *  into a Blob, so callers always see a Blob. */
  function blobToArrayBuffer(blob) {
    if (blob && typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      try {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(fr.error); };
        fr.readAsArrayBuffer(blob);
      } catch (e) { reject(e); }
    });
  }

  function isQuota(e) {
    var n = errName(e);
    return n === "QuotaExceededError" || n === "NS_ERROR_DOM_QUOTA_REACHED" ||
      (e && e.code === 22);
  }

  /**
   * Saves one TurnRecord (DRD §3.2).
   * Resolves {ok:true} | {ok:true, audioDropped:true} | {ok:false, reason}.
   * On QuotaExceededError the record is saved again without audio
   * (DRD §8 "Storage full"); the caller then sends RECORD_FAILED("quota").
   */
  function saveTurn(rec) {
    if (!isPlainRecord(rec) || typeof rec.id !== "string" || !rec.id ||
        typeof rec.sessionId !== "string" || !rec.sessionId) {
      warn("saveTurn: missing id or sessionId");
      return Promise.resolve({ ok: false, reason: "invalid" });
    }
    var hasAudio = !!rec.audioBlob;

    function dropAudioAndRetry(why) {
      return putTurn(withoutAudio(rec)).then(function (r2) {
        if (r2.ok) return { ok: true, audioDropped: true, reason: why };
        warn("saveTurn without audio also failed", errName(r2.error));
        return { ok: false, reason: isQuota(r2.error) ? "quota" : "error" };
      });
    }

    return putTurn(rec).then(function (r) {
      if (r.ok) return { ok: true };
      if (r.error && r.error.name === "Unavailable") return { ok: false, reason: "unavailable" };
      if (hasAudio && isQuota(r.error)) {
        warn("storage full: saving turn without audio");
        return dropAudioAndRetry("quota");
      }
      if (hasAudio && errName(r.error) === "DataCloneError") {
        return blobToArrayBuffer(rec.audioBlob).then(function (buf) {
          var copy = {};
          for (var k in rec) if (Object.prototype.hasOwnProperty.call(rec, k)) copy[k] = rec[k];
          copy.audioBlob = buf;
          return putTurn(copy).then(function (r3) {
            if (r3.ok) return { ok: true };
            if (isQuota(r3.error)) return dropAudioAndRetry("quota");
            return dropAudioAndRetry("error");
          });
        }, function () { return dropAudioAndRetry("error"); });
      }
      warn("saveTurn failed", errName(r.error));
      return { ok: false, reason: isQuota(r.error) ? "quota" : "error" };
    }).catch(function (e) {
      warn("saveTurn threw", errName(e));
      return { ok: false, reason: "error" };
    });
  }

  function normaliseTurn(t) {
    if (t && t.audioBlob && typeof Blob !== "undefined" && !(t.audioBlob instanceof Blob)) {
      try {
        t.audioBlob = new Blob([t.audioBlob], { type: t.mimeType || "" });
      } catch (e) { t.audioBlob = null; }
    }
    return t;
  }

  function byTurnOrder(a, b) {
    return (a.turnIndex || 0) - (b.turnIndex || 0) ||
      (a.round || 0) - (b.round || 0) ||
      (a.playerIndex || 0) - (b.playerIndex || 0);
  }

  /** Resolves the session's TurnRecords in turnIndex order ([] when none),
   *  or null when storage failed. */
  function getStoryTurns(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) return Promise.resolve([]);
    return withStore(STORE_TURNS, "readonly", function (store, set) {
      var req = store.index("sessionId").getAll(sessionId);
      req.onsuccess = function () { set(req.result || []); };
    }).then(function (r) {
      if (!r.ok) { warn("getStoryTurns failed", errName(r.error)); return null; }
      return (r.value || []).map(normaliseTurn).sort(byTurnOrder);
    });
  }

  /** Resolves a SessionRecord or null. */
  function getSession(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) return Promise.resolve(null);
    return withStore(STORE_SESSIONS, "readonly", function (store, set) {
      var req = store.get(sessionId);
      req.onsuccess = function () { set(req.result || null); };
    }).then(function (r) {
      if (!r.ok) { warn("getSession failed", errName(r.error)); return null; }
      return r.value || null;
    });
  }

  /**
   * "Delete this story's voices and names" (DRD §3.2): on every turn of the
   * session sets audioBlob = null, audioByteSize = 0, mimeType = null and
   * nickname = null. The session then no longer counts as the last saved story.
   * Resolves true / false.
   */
  function deleteStoryAudio(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) return Promise.resolve(false);
    return withStore(STORE_TURNS, "readwrite", function (store) {
      var req = store.index("sessionId").openCursor(IDBKeyRange.only(sessionId));
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur) return;
        var t = cur.value;
        t.audioBlob = null;
        t.audioByteSize = 0;
        t.mimeType = null;
        t.nickname = null;
        cur.update(t);
        cur.continue();
      };
    }).then(function (r) {
      if (!r.ok) warn("deleteStoryAudio failed", errName(r.error));
      return r.ok;
    });
  }

  function hasPersonalData(t) {
    return !!(t && (t.audioBlob || (typeof t.nickname === "string" && t.nickname)));
  }

  /**
   * Setup's Delete (decision 2026-10-28): clears audio and nicknames on every
   * turn of every story on this device. Resolves true / false.
   */
  function deleteAllSavedAudio() {
    return withStore(STORE_TURNS, "readwrite", function (store) {
      var req = store.openCursor();
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur) return;
        var t = cur.value;
        if (hasPersonalData(t)) {
          t.audioBlob = null;
          t.audioByteSize = 0;
          t.mimeType = null;
          t.nickname = null;
          cur.update(t);
        }
        cur.continue();
      };
    }).then(function (r) {
      if (!r.ok) warn("deleteAllSavedAudio failed", errName(r.error));
      return r.ok;
    });
  }

  /**
   * The newest story (by startedAt) that still holds voices or names on this
   * device, for the setup note "Your last story is still saved".
   * Resolves {session, turns, audioCount, savedCount} or null; savedCount is
   * how many stories on the device still hold voices or names (this one included).
   */
  function getLastSavedStory() {
    return withStore(STORE_SESSIONS, "readonly", function (store, set) {
      var req = store.getAll();
      req.onsuccess = function () { set(req.result || []); };
    }).then(function (r) {
      if (!r.ok) { warn("getLastSavedStory failed", errName(r.error)); return null; }
      var sessions = (r.value || []).slice().sort(function (a, b) {
        return String(b.startedAt || "").localeCompare(String(a.startedAt || ""));
      });
      var i = 0;
      var found = null;
      var savedCount = 0;
      function nextOne() {
        if (i >= sessions.length) {
          if (found) found.savedCount = savedCount;
          return found;
        }
        var s = sessions[i++];
        return getStoryTurns(s.sessionId).then(function (turns) {
          if (turns && turns.some(hasPersonalData)) {
            savedCount += 1;
            if (!found) {
              found = {
                session: s,
                turns: turns,
                audioCount: turns.filter(function (t) { return !!t.audioBlob; }).length
              };
            }
          }
          return nextOne();
        });
      }
      return nextOne();
    }).catch(function (e) {
      warn("getLastSavedStory threw", errName(e));
      return null;
    });
  }

  /** Marks a session "abandoned" if it is still "active". Resolves true/false. */
  function markAbandoned(sessionId) {
    return getSession(sessionId).then(function (s) {
      if (!s || s.status !== "active") return false;
      s.status = "abandoned";
      return saveSession(s);
    });
  }

  // ------------------------------------------------------------------------
  // localStorage helpers (all synchronous, all wrapped)
  // ------------------------------------------------------------------------

  function lsGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { warn("localStorage read failed", errName(e)); return null; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { warn("localStorage write failed", errName(e)); return false; }
  }
  function lsRemove(key) {
    try { window.localStorage.removeItem(key); return true; } catch (e) { warn("localStorage remove failed", errName(e)); return false; }
  }

  // ------------------------------------------------------------------------
  // Draft (engine state, no audio) — DRD §8
  // ------------------------------------------------------------------------

  /** Writes {state, savedAt} (savedAt = ISO 8601 UTC). Synchronous; returns true/false. */
  function saveDraft(state) {
    if (state === null || typeof state !== "object") return false;
    var json;
    try {
      json = JSON.stringify({ state: state, savedAt: new Date().toISOString() });
    } catch (e) {
      warn("saveDraft: state is not JSON", errName(e));
      return false;
    }
    return lsSet(DRAFT_KEY, json);
  }

  /**
   * Synchronous. Returns {state, savedAt} when the draft is under 12h old,
   * else null. An expired or unparsable draft is removed; an expired draft's
   * session (state.sessionId, when present) is marked "abandoned" in the
   * background (DRD §8 "Otherwise discard it and mark the session abandoned").
   */
  function loadDraft() {
    var raw = lsGet(DRAFT_KEY);
    if (raw === null) return null;
    var d;
    try { d = JSON.parse(raw); } catch (e) { d = null; }
    var t = d && typeof d.savedAt === "string" ? Date.parse(d.savedAt) : NaN;
    if (!d || typeof d !== "object" || !d.state || typeof d.state !== "object" || isNaN(t)) {
      warn("loadDraft: unparsable draft removed");
      lsRemove(DRAFT_KEY);
      return null;
    }
    var age = Date.now() - t;
    if (age > DRAFT_MAX_AGE_MS || age < -CLOCK_SKEW_MS) {
      lsRemove(DRAFT_KEY);
      if (typeof d.state.sessionId === "string" && d.state.sessionId) {
        markAbandoned(d.state.sessionId);   // fire and forget; always resolves
      }
      return null;
    }
    return { state: d.state, savedAt: d.savedAt };
  }

  /** Synchronous; returns true/false. */
  function clearDraft() {
    return lsRemove(DRAFT_KEY);
  }

  // ------------------------------------------------------------------------
  // Preferences — never names (decision 2026-10-20, a11y pass §9)
  // ------------------------------------------------------------------------

  function cleanPrefs(obj) {
    var out = {};
    if (!obj || typeof obj !== "object") return out;
    for (var k in PREF_RULES) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && PREF_RULES[k](obj[k])) out[k] = obj[k];
    }
    return out;
  }

  function readPrefsRaw() {
    var raw = lsGet(PREFS_KEY);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (e) { return undefined; }
  }

  /**
   * Synchronous. Returns the stored preferences with only the allowed keys
   * (level, playerCount, useCharacters, cardStyle, bigScreen), or null when
   * nothing usable is stored. If the stored value held anything else (a name,
   * an unknown key, a bad value) it is rewritten without it.
   */
  function loadPrefs() {
    var raw = readPrefsRaw();
    if (raw === null) return null;
    if (raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
      lsRemove(PREFS_KEY);
      return null;
    }
    var clean = cleanPrefs(raw);
    if (Object.keys(clean).length !== Object.keys(raw).length) {
      lsSet(PREFS_KEY, JSON.stringify(clean));
    }
    return Object.keys(clean).length ? clean : null;
  }

  /** Synchronous. Merges the allowed keys of `prefs` into the stored ones.
   *  Any other field (nicknames included) is ignored. Returns true/false. */
  function savePrefs(prefs) {
    var current = loadPrefs() || {};
    var add = cleanPrefs(prefs);
    for (var k in add) current[k] = add[k];
    return lsSet(PREFS_KEY, JSON.stringify(current));
  }

  TW.storage = {
    isAvailable: isAvailable,
    openDb: openDb,
    saveSession: saveSession,
    saveTurn: saveTurn,
    getSession: getSession,
    getStoryTurns: getStoryTurns,
    deleteStoryAudio: deleteStoryAudio,
    deleteAllSavedAudio: deleteAllSavedAudio,
    getLastSavedStory: getLastSavedStory,
    saveDraft: saveDraft,
    loadDraft: loadDraft,
    clearDraft: clearDraft,
    loadPrefs: loadPrefs,
    savePrefs: savePrefs,
    // Constants, for the manual check page and tests only.
    DB_NAME: DB_NAME,
    DRAFT_KEY: DRAFT_KEY,
    PREFS_KEY: PREFS_KEY,
    DRAFT_MAX_AGE_MS: DRAFT_MAX_AGE_MS
  };
})(window.ThenWhat);
