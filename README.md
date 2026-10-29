# Then What?! — web game

Plain HTML, CSS and JavaScript. No libraries, no npm, no build step, no network requests.

## Run it

From the project root:

```
python3 -m http.server
```

Then open <http://localhost:8000/web/>.

- Recording needs a secure page, so use `localhost` (or HTTPS). Opening `web/index.html` straight from the file system (`file://`) works, but the microphone is then unavailable and the game says so ("Continue without recording" only).
- On a phone, use the test build at <https://kevalparikh22.github.io/then-what-test/>. Run `tools/publish-test-build.sh` after committing changes to update it. It publishes only this folder ([privacy guardrails](../docs/decisions/2026-10-29-child-privacy-guardrails.md)).
- Any static server works. Nothing is fetched from the internet.

## Files

| File | What it is |
|---|---|
| `index.html` | The page shell. Loads the files below in order and holds an inline copy of the icon sprite. |
| `css/tokens.css` | Design tokens only (colours, sizes, motion). |
| `css/cards.css` | Card components (Lantern, Collectible, Sticker styles). |
| `css/app.css` | Page layout and components, using tokens only. |
| `js/content.js` | All game content and on-screen words (`ThenWhat.content`). |
| `js/engine.js` | Pure game rules (`ThenWhat.engine`). No DOM, storage or audio. |
| `js/storage.js` | IndexedDB (sessions, turns, voices) and localStorage (draft, preferences). |
| `js/audio.js` | Recording, story playback, read-aloud (local voices only), wake lock. |
| `js/ui.js` | Screens and taps (`ThenWhat.ui`). The only file that touches the page. |
| `icons/icons.svg` | Source of the icon sprite. **After changing it, copy its `<symbol>`s into `index.html`** between `ICONS:START` and `ICONS:END`. |

Scripts are classic `<script>` tags sharing `window.ThenWhat` (ES modules don't load from `file://`).

## Tests

- `tests.html`: engine and content tests. Open it in a browser; the page title becomes `PASS` or `FAIL`.
- `content-check.html`: content checks only.
- `audio-storage-check.html`: manual and automatic checks for recording, playback and storage (needs `localhost`).
- The game screens are checked by hand for now; see `docs/architecture/2026-10-23-ui-notes.md` for what was run.
