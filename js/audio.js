/* ==========================================================================
   Then What?! — audio.js  ->  ThenWhat.audio
   Owner: Game Audio Engineer                    Date: 2026-10-23
   Contract: docs/architecture/2026-10-23-phase-3-build-plan.md §3.4,
             DRD v1.1 §4 (recording, MIME order, playback), §8 (wake lock)
             a11y pass 2026-10-22 §4 (read-aloud: local voices only, A-05)
   Notes:    docs/architecture/2026-10-23-audio-storage-notes.md

   RULES
   - The microphone is asked for ONLY inside startRecording(), which the UI
     calls only after a Record tap. Nothing here runs on load.
   - No network: no fetch/XHR/WebSocket. Read-aloud uses only voices with
     localService === true; if there are none, canSpeak() is false and
     speak() does nothing (a network voice would send text off the device).
   - Every promise resolves; nothing rejects or throws into the UI.
   - No DOM access beyond an off-document HTMLAudioElement and the
     document.visibilityState read for the wake lock.
   ========================================================================== */
window.ThenWhat = window.ThenWhat || {};

(function (TW) {
  "use strict";

  // DRD §4.2, in order.
  var MIME_ORDER = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  var TIMESLICE_MS = 1000;           // DRD §4.1: 1 s chunks
  var DEFAULT_MAX_SECONDS = 60;      // DRD §4.1: 60 s cap
  var VOICE_BITRATE = 48000;         // speech; ~360 KB per minute instead of ~1 MB
  var STOP_TIMEOUT_MS = 3000;        // if "stop" never fires, build the Blob anyway
  var VOICES_TIMEOUT_MS = 1500;      // wait this long for voiceschanged

  function warn() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift("[ThenWhat.audio]");
      console.warn.apply(console, args);
    } catch (e) { /* ignore */ }
  }

  function now() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  // ------------------------------------------------------------------------
  // Capture
  // ------------------------------------------------------------------------

  /** True when getUserMedia and MediaRecorder exist (DRD §4.1, §8 "No mic API").
   *  Does not ask for permission. */
  function canRecord() {
    try {
      return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" &&
        typeof window.MediaRecorder === "function");
    } catch (e) {
      return false;
    }
  }

  /** The first supported type from DRD §4.2, or "" when none is reported. */
  function pickMimeType() {
    try {
      if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") return "";
      for (var i = 0; i < MIME_ORDER.length; i++) {
        if (MediaRecorder.isTypeSupported(MIME_ORDER[i])) return MIME_ORDER[i];
      }
    } catch (e) { /* ignore */ }
    return "";
  }

  function mapGetUserMediaError(e) {
    var n = (e && e.name) || "";
    if (n === "NotAllowedError" || n === "PermissionDeniedError" || n === "SecurityError") return "denied";
    return "unavailable";   // NotFoundError, NotReadableError, AbortError, OverconstrainedError, TypeError…
  }

  /** Tries the chosen type (with and without a bitrate), then no type at all. */
  function makeRecorder(stream, mimeType) {
    var attempts = [];
    if (mimeType) {
      attempts.push({ mimeType: mimeType, audioBitsPerSecond: VOICE_BITRATE });
      attempts.push({ mimeType: mimeType });
    }
    attempts.push({ audioBitsPerSecond: VOICE_BITRATE });
    attempts.push(null);
    for (var i = 0; i < attempts.length; i++) {
      try {
        return attempts[i] ? new MediaRecorder(stream, attempts[i]) : new MediaRecorder(stream);
      } catch (e) {
        warn("MediaRecorder rejected options", attempts[i], e && e.name);
      }
    }
    return null;
  }

  function stopTracks(stream) {
    if (!stream) return;
    try {
      stream.getTracks().forEach(function (t) {
        t.onended = null;
        try { t.stop(); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }

  var rec = null;          // current recording session object (see startRecording)
  var lastRec = null;      // the most recent finished session, so stopRecording is idempotent
  var pendingStart = null; // {cancelled:boolean} while getUserMedia is waiting
  var disconnectListeners = [];

  /**
   * Starts recording. Call only from a Record tap.
   * options: {maxSeconds = 60, onAutoStop(result)}
   * Resolves {ok:true, mimeType} or {ok:false, reason}, reason one of
   * "unavailable" | "denied" | "unsupported" | "cancelled".
   * "cancelled" means stopRecording() was called while the permission prompt
   * was still open; nothing was recorded and the mic is not blocked.
   */
  function startRecording(options) {
    options = options || {};
    var maxSeconds = (typeof options.maxSeconds === "number" && options.maxSeconds > 0)
      ? options.maxSeconds : DEFAULT_MAX_SECONDS;
    var onAutoStop = typeof options.onAutoStop === "function" ? options.onAutoStop : null;

    if (rec) return Promise.resolve({ ok: true, mimeType: rec.mimeType });
    if (pendingStart) return Promise.resolve({ ok: false, reason: "cancelled" });
    if (!canRecord()) return Promise.resolve({ ok: false, reason: "unavailable" });

    // a11y pass §4.2: cancel read-aloud before asking for the mic; and only
    // one sound source at a time.
    stopSpeaking();
    stop();
    lastRec = null;

    var token = { cancelled: false };
    pendingStart = token;

    var gum;
    try {
      gum = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (e) {
      pendingStart = null;
      return Promise.resolve({ ok: false, reason: mapGetUserMediaError(e) });
    }

    return Promise.resolve(gum).then(function (stream) {
      pendingStart = null;
      if (token.cancelled) {
        stopTracks(stream);
        return { ok: false, reason: "cancelled" };
      }
      var chosen = pickMimeType();
      var recorder = makeRecorder(stream, chosen);
      if (!recorder) {
        stopTracks(stream);
        return { ok: false, reason: "unsupported" };
      }

      var session = {
        stream: stream,
        recorder: recorder,
        mimeType: recorder.mimeType || chosen || "",
        chunks: [],
        startedAt: 0,
        endedAt: 0,
        maxSeconds: maxSeconds,
        timer: null,
        stopPromise: null,
        cause: null
      };

      recorder.ondataavailable = function (ev) {
        if (ev && ev.data && ev.data.size > 0) session.chunks.push(ev.data);
      };
      recorder.onerror = function (ev) {
        warn("MediaRecorder error", ev && ev.error && ev.error.name);
        finishFromEvent(session, "disconnect");
      };
      try {
        stream.getAudioTracks().forEach(function (track) {
          track.onended = function () { finishFromEvent(session, "disconnect"); };
        });
      } catch (e) { /* ignore */ }

      try {
        recorder.start(TIMESLICE_MS);
      } catch (e) {
        warn("MediaRecorder.start failed", e && e.name);
        stopTracks(stream);
        return { ok: false, reason: "unsupported" };
      }
      session.startedAt = now();
      session.timer = setTimeout(function () {
        session.timer = null;
        if (rec !== session) return;
        stopSession(session, "auto").then(function (result) {
          if (onAutoStop) {
            try { onAutoStop(result); } catch (e) { warn("onAutoStop threw", e); }
          }
        });
      }, maxSeconds * 1000);
      rec = session;
      return { ok: true, mimeType: session.mimeType };
    }, function (e) {
      pendingStart = null;
      warn("getUserMedia failed", e && e.name);
      return { ok: false, reason: token.cancelled ? "cancelled" : mapGetUserMediaError(e) };
    });
  }

  /** Track ended (unplugged, permission revoked, OS took the mic) or recorder error. */
  function finishFromEvent(session, cause) {
    if (rec !== session || session.stopPromise) return;
    stopSession(session, cause).then(function (result) {
      disconnectListeners.slice().forEach(function (cb) {
        try { cb(result); } catch (e) { warn("onDisconnect listener threw", e); }
      });
    });
  }

  /** Stops one session once. Resolves the result; the same promise on repeat calls. */
  function stopSession(session, cause) {
    if (session.stopPromise) return session.stopPromise;
    session.cause = cause;
    if (session.timer) { clearTimeout(session.timer); session.timer = null; }

    session.stopPromise = new Promise(function (resolve) {
      var done = false;
      var guard = null;
      function finish() {
        if (done) return;
        done = true;
        if (guard) clearTimeout(guard);
        session.endedAt = session.endedAt || now();
        stopTracks(session.stream);
        if (rec === session) rec = null;
        lastRec = session;
        var seconds = Math.max(0, (session.endedAt - session.startedAt) / 1000);
        seconds = Math.min(session.maxSeconds, Math.round(seconds * 10) / 10);
        if (!session.chunks.length) {
          resolve({ ok: false, reason: "empty", cause: cause, durationSeconds: seconds });
          return;
        }
        var type = session.recorder.mimeType || session.mimeType ||
          (session.chunks[0] && session.chunks[0].type) || "";
        var blob;
        try {
          blob = new Blob(session.chunks, type ? { type: type } : undefined);
        } catch (e) {
          resolve({ ok: false, reason: "error", cause: cause, durationSeconds: seconds });
          return;
        }
        resolve({ ok: true, blob: blob, mimeType: type || null, durationSeconds: seconds, cause: cause });
      }

      session.endedAt = now();
      var r = session.recorder;
      var alreadyInactive = r.state === "inactive";
      // The last dataavailable arrives just before "stop"; build the Blob after it.
      r.onstop = function () { setTimeout(finish, 0); };
      // If the browser stopped the recorder itself (track ended, error), its
      // dataavailable/stop events may still be queued: wait briefly for them.
      guard = setTimeout(function () {
        if (!alreadyInactive) warn("MediaRecorder stop event did not arrive; using chunks so far");
        finish();
      }, alreadyInactive ? 500 : STOP_TIMEOUT_MS);
      if (!alreadyInactive) {
        try {
          r.stop();
        } catch (e) {
          warn("MediaRecorder.stop threw", e && e.name);
          finish();
        }
      }
    });
    return session.stopPromise;
  }

  /**
   * Stops the recording (Stop tap, Pause). Always stops the mic tracks.
   * Resolves {ok:true, blob, mimeType, durationSeconds, cause} or
   * {ok:false, reason: "empty" | "not-recording" | "error"}.
   * cause is "manual" | "auto" (60 s cap) | "disconnect".
   * Right after an auto-stop or disconnect, the first call returns that same
   * result (the turn id is the same, so a second saveTurn just overwrites).
   */
  function stopRecording() {
    if (pendingStart) {
      pendingStart.cancelled = true;
      return Promise.resolve({ ok: false, reason: "not-recording" });
    }
    if (rec) {
      rec.delivered = true;
      return stopSession(rec, "manual");
    }
    // Stop tapped just after the 60 s cap or a disconnect: hand over that
    // result once, never again (a later turn must not get an old clip).
    if (lastRec && lastRec.stopPromise && !lastRec.delivered) {
      lastRec.delivered = true;
      return lastRec.stopPromise;
    }
    return Promise.resolve({ ok: false, reason: "not-recording" });
  }

  function isRecording() {
    return !!rec;
  }

  /** cb(result) runs when the mic disconnects mid-recording. The chunks so far
   *  are kept: result is the same shape as stopRecording(). Returns an
   *  unsubscribe function. */
  function onDisconnect(cb) {
    if (typeof cb !== "function") return function () {};
    disconnectListeners.push(cb);
    return function () {
      disconnectListeners = disconnectListeners.filter(function (f) { return f !== cb; });
    };
  }

  // ------------------------------------------------------------------------
  // Playback (Epilogue only — DRD §4.3)
  // ------------------------------------------------------------------------

  var el = null;           // one reused element: iOS keeps it "unlocked" after the first tap
  var currentUrl = null;
  var play = null;         // {items, index, onItem, onEnd, single}
  var playSeq = 0;         // bumps on every clip start; stale play() rejections are ignored

  function getEl() {
    if (!el && typeof Audio === "function") {
      el = new Audio();
      el.preload = "auto";
      el.addEventListener("ended", function () { advance(); });
      el.addEventListener("error", function () {
        if (currentUrl) { warn("clip could not be played; skipping"); advance(); }
      });
    }
    return el;
  }

  function releaseUrl() {
    if (currentUrl) {
      try { URL.revokeObjectURL(currentUrl); } catch (e) { /* ignore */ }
      currentUrl = null;
    }
  }

  function clearEl() {
    if (!el) return;
    try { el.pause(); } catch (e) { /* ignore */ }
    releaseUrl();
    try { el.removeAttribute("src"); el.load(); } catch (e) { /* ignore */ }
  }

  function endPlayback(completed) {
    var p = play;
    play = null;
    clearEl();
    if (p && p.onEnd) {
      try { p.onEnd({ completed: completed }); } catch (e) { warn("onEnd threw", e); }
    }
  }

  function hasBlob(item) {
    var b = item && (item.blob || item.audioBlob);
    return (typeof Blob !== "undefined" && b instanceof Blob && b.size > 0) ? b : null;
  }

  /** Starts the clip at play.index or the next one that has audio. Resolves true if one started. */
  function startFrom(index) {
    if (!play) return Promise.resolve(false);
    var items = play.items;
    while (index < items.length && !hasBlob(items[index])) index++;
    if (index >= items.length) { endPlayback(true); return Promise.resolve(false); }
    play.index = index;
    var audioEl = getEl();
    if (!audioEl) { endPlayback(false); return Promise.resolve(false); }
    releaseUrl();
    try {
      currentUrl = URL.createObjectURL(hasBlob(items[index]));
    } catch (e) {
      return startFrom(index + 1);
    }
    audioEl.src = currentUrl;
    var mine = play;
    var seq = ++playSeq;
    if (mine.onItem) {
      try { mine.onItem(items[index], index); } catch (e) { warn("onItem threw", e); }
    }
    var result;
    try { result = audioEl.play(); } catch (e) { result = Promise.reject(e); }
    return Promise.resolve(result).then(function () { return true; }, function (e) {
      if (play !== mine || seq !== playSeq) return false;   // superseded by next()/stop()
      if (e && e.name === "AbortError") return false;        // src changed under it
      warn("play() refused", e && e.name);
      // NotAllowedError (no user gesture) cannot be fixed by skipping: stop.
      if (e && e.name === "NotAllowedError") { endPlayback(false); return false; }
      return startFrom(index + 1);
    });
  }

  function advance() {
    if (!play) return;
    releaseUrl();
    if (play.single) { endPlayback(true); return; }
    startFrom(play.index + 1);
  }

  /**
   * Plays every item that has audio, in array order (pass turns already in
   * turnIndex order; getStoryTurns returns them that way). Items without
   * audio are skipped. Items are TurnRecords ({audioBlob}) or {blob}.
   * callbacks: onItem(item, indexInItems) when a clip starts,
   *            onEnd({completed}) once, at the end or on stop().
   * Resolves true when a clip started. Call from a tap (no autoplay).
   */
  function playStory(items, callbacks) {
    callbacks = callbacks || {};
    stopSpeaking();
    stop();
    play = {
      items: Array.isArray(items) ? items.slice() : [],
      index: 0,
      onItem: callbacks.onItem || null,
      onEnd: callbacks.onEnd || null,
      single: false
    };
    return startFrom(0);
  }

  /** Plays one clip. callbacks: {onEnd({completed})}. Resolves true when it started. */
  function playOne(blob, callbacks) {
    callbacks = callbacks || {};
    stopSpeaking();
    stop();
    play = { items: [{ blob: blob }], index: 0, onItem: null, onEnd: callbacks.onEnd || null, single: true };
    return startFrom(0);
  }

  function pause() {
    if (play && el) { try { el.pause(); } catch (e) { /* ignore */ } }
  }

  /** Resolves true when playback continued. */
  function resume() {
    if (!play || !el) return Promise.resolve(false);
    var r;
    try { r = el.play(); } catch (e) { r = Promise.reject(e); }
    return Promise.resolve(r).then(function () { return true; }, function () { return false; });
  }

  /** Skips to the next clip (ends playback after the last one, or for playOne). */
  function next() {
    if (!play) return;
    advance();
  }

  /** Stops playback and frees the clip. onEnd({completed:false}) runs. */
  function stop() {
    if (play) endPlayback(false);
    else clearEl();
  }

  /** "idle" | "playing" | "paused" */
  function getPlaybackState() {
    if (!play || !el) return "idle";
    return el.paused ? "paused" : "playing";
  }

  // ------------------------------------------------------------------------
  // Read-aloud (speechSynthesis) — local voices only (a11y pass §4.3, A-05)
  // ------------------------------------------------------------------------

  var synth = null;
  try { synth = window.speechSynthesis || null; } catch (e) { synth = null; }
  var voice = null;
  var voicesPromise = null;

  function pageLang() {
    var l = "";
    try { l = (document.documentElement && document.documentElement.lang) || ""; } catch (e) { /* ignore */ }
    if (!l) { try { l = navigator.language || ""; } catch (e) { /* ignore */ } }
    return (l || "en").toLowerCase();
  }

  /** Local voices only, ordered: exact page language, same primary language
   *  (default voice first). Voices in other languages are not used. */
  function localVoices() {
    if (!synth) return [];
    var all;
    try { all = synth.getVoices() || []; } catch (e) { all = []; }
    var lang = pageLang();
    var primary = lang.split("-")[0];
    var local = all.filter(function (v) {
      var vl = String(v.lang || "").toLowerCase().replace("_", "-");
      return v.localService === true && vl.split("-")[0] === primary;
    });
    function score(v) {
      var vl = String(v.lang || "").toLowerCase().replace("_", "-");
      return (vl === lang ? 2 : 0) + (v["default"] ? 1 : 0);
    }
    return local.sort(function (a, b) { return score(b) - score(a); });
  }

  function choose() {
    var list = localVoices();
    // Keep the same voice for the whole page life when it is still offered.
    if (voice && list.some(function (v) { return v.voiceURI === voice.voiceURI; })) return voice;
    voice = list[0] || null;
    return voice;
  }

  /** Resolves true when a local voice for the page language exists. Waits for
   *  the browser's voice list once (voiceschanged, at most 1.5 s). */
  function canSpeak() {
    if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return Promise.resolve(false);
    if (voicesPromise) return voicesPromise.then(function () { return !!choose(); });
    voicesPromise = new Promise(function (resolve) {
      var hasAny = false;
      try { hasAny = (synth.getVoices() || []).length > 0; } catch (e) { /* ignore */ }
      if (hasAny) { resolve(); return; }
      var timer = setTimeout(done, VOICES_TIMEOUT_MS);
      function done() {
        clearTimeout(timer);
        try { synth.removeEventListener("voiceschanged", done); } catch (e) { /* ignore */ }
        resolve();
      }
      try { synth.addEventListener("voiceschanged", done); } catch (e) { /* old engines: timeout only */ }
    });
    try {
      synth.addEventListener("voiceschanged", function () { choose(); });
    } catch (e) { /* ignore */ }
    return voicesPromise.then(function () { return !!choose(); });
  }

  /** The chosen local voice's name and language, for the check page. */
  function getVoiceInfo() {
    var v = choose();
    return v ? { name: v.name, lang: v.lang, voiceURI: v.voiceURI } : null;
  }

  /** All voices with their localService flag, for the check page only. */
  function listVoices() {
    if (!synth) return [];
    try {
      return (synth.getVoices() || []).map(function (v) {
        return { name: v.name, lang: v.lang, localService: v.localService === true, isDefault: !!v["default"] };
      });
    } catch (e) { return []; }
  }

  /**
   * Speaks text with the local voice. Cancels anything already speaking.
   * options: {rate = 0.9 (Story Sprout; pass 1.0 for Tale Weaver), onEnd()}.
   * Returns true when it started speaking; false when no local voice exists.
   * Never falls back to a network or unknown voice.
   */
  function speak(text, options) {
    options = options || {};
    if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return false;
    var v = choose();
    if (!v || typeof text !== "string" || !text.trim()) return false;
    try { synth.cancel(); } catch (e) { /* ignore */ }
    var u;
    try {
      u = new SpeechSynthesisUtterance(text);
      u.voice = v;          // always the local voice: never the engine default
      u.lang = v.lang;
      u.rate = typeof options.rate === "number" ? options.rate : 0.9;
      u.pitch = 1;
    } catch (e) { return false; }
    if (typeof options.onEnd === "function") {
      var called = false;
      var end = function () { if (!called) { called = true; try { options.onEnd(); } catch (e) { /* ignore */ } } };
      u.onend = end;
      u.onerror = end;
    }
    try { synth.speak(u); } catch (e) { return false; }
    return true;
  }

  function stopSpeaking() {
    if (!synth) return;
    try { synth.cancel(); } catch (e) { /* ignore */ }
  }

  function isSpeaking() {
    try { return !!(synth && (synth.speaking || synth.pending)); } catch (e) { return false; }
  }

  // ------------------------------------------------------------------------
  // Screen Wake Lock (DRD §8)
  // ------------------------------------------------------------------------

  var wantAwake = false;
  var sentinel = null;
  var visibilityHooked = false;

  function requestLock() {
    try {
      if (!navigator.wakeLock || typeof navigator.wakeLock.request !== "function") return Promise.resolve(false);
      if (typeof document !== "undefined" && document.visibilityState && document.visibilityState !== "visible") {
        return Promise.resolve(false);   // re-acquired on visibilitychange
      }
      return navigator.wakeLock.request("screen").then(function (s) {
        if (!wantAwake) { try { s.release(); } catch (e) { /* ignore */ } return false; }
        sentinel = s;
        s.addEventListener("release", function () { if (sentinel === s) sentinel = null; });
        return true;
      }, function (e) {
        warn("wake lock refused", e && e.name);
        return false;
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /** keepAwake(true) while a story is in progress; keepAwake(false) on Pause,
   *  Your story and Setup. Resolves true when a lock is held. Unsupported
   *  browsers resolve false and nothing else happens. */
  function keepAwake(on) {
    wantAwake = !!on;
    if (!visibilityHooked && typeof document !== "undefined" && document.addEventListener) {
      visibilityHooked = true;
      document.addEventListener("visibilitychange", function () {
        if (wantAwake && !sentinel && document.visibilityState === "visible") requestLock();
      });
    }
    if (!wantAwake) {
      var s = sentinel;
      sentinel = null;
      if (s) { try { s.release(); } catch (e) { /* ignore */ } }
      return Promise.resolve(false);
    }
    if (sentinel && !sentinel.released) return Promise.resolve(true);
    return requestLock();
  }

  function isKeptAwake() {
    return !!(sentinel && !sentinel.released);
  }

  TW.audio = {
    // capture
    canRecord: canRecord,
    pickMimeType: pickMimeType,
    startRecording: startRecording,
    stopRecording: stopRecording,
    isRecording: isRecording,
    onDisconnect: onDisconnect,
    // playback
    playStory: playStory,
    playOne: playOne,
    pause: pause,
    resume: resume,
    next: next,
    stop: stop,
    getPlaybackState: getPlaybackState,
    // speech
    canSpeak: canSpeak,
    speak: speak,
    stopSpeaking: stopSpeaking,
    isSpeaking: isSpeaking,
    getVoiceInfo: getVoiceInfo,
    listVoices: listVoices,
    // wake lock
    keepAwake: keepAwake,
    isKeptAwake: isKeptAwake,
    MIME_ORDER: MIME_ORDER.slice()
  };
})(window.ThenWhat);
