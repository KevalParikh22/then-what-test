# Then What?! line icons (placeholder set v0.1)

**Status**: Placeholder. To be replaced by the custom illustrated icon set (not started).
**Date**: 2026-10-22
**Owner / Role**: Technical Artist
**File**: `icons.svg` (an SVG sprite of 74 `<symbol>` elements)
**Preview**: the "Line icons" section of `design/2026-10-22-reframe-options.html`

## Rules

- **These are placeholders.** They replace every emoji in the design (project lead feedback, 2026-10-22) until the custom illustrated set is made. Keep the ids when the art is replaced, so code doesn't change.
- **No emoji anywhere** in the UI, content display or printed cards. Use an icon from this sprite plus a word.
- **Always show a word next to an icon** (research §4.1 principle 5: picture plus word, never picture alone). An icon-only button (Grown-up tools, read aloud, play) still needs an accessible name (`aria-label`).
- Drawn by hand on a 24×24 grid: 2px stroke, round caps and joins, `fill="none"`, `stroke="currentColor"`. Player shape markers are the exception: solid, `fill="currentColor"`.
- Colour comes from CSS `color` on the parent. Icons must meet 3:1 against their background (WCAG 1.4.11).
- Each symbol has a `<title>` (English). Decorative use: `aria-hidden="true"` on the outer `<svg>`.
- No external sources and no copied icon sets. Nothing loads from the network.

## How to use

The sprite works without a server only when it is **inlined** in the page (classic `<script>` / `file://` setup, see the architecture note). Paste the contents of `icons.svg` once at the top of `<body>`, then:

```html
<svg class="icon" aria-hidden="true" focusable="false"><use href="#ui-mic"/></svg> Record
```

When served over http(s) the external form also works: `<use href="icons/icons.svg#ui-mic"/>`.

Ids for Build a World items, characters and worlds match the ids in `Then What - Base Game Content v1.0.md` (`where-<id>`, `when-<id>`, `kind-<id>`, `quest-<id>`, `char-<id without "ch-">`), so `content.js` can store the icon id next to each item.

## Known gaps

- `world-jungle` and `where-jungle` are the same drawing, and so are `world-school` and `where-school` (same idea, two ids so they can diverge later).
- `card-world` is a globe, so it doesn't clash with `char-map-maker` (a map with an X) or `level-weaver` (a folded map).
- `shape-heart` and `char-kind-helper` share a heart outline (solid vs line).
- Not yet tested: recognition by 6–8-year-olds without the word (research §5, 5-child card-sort test).

## Ids

### UI actions

| id | Meaning |
|---|---|
| `ui-mic` | Record |
| `ui-stop` | Stop |
| `ui-continue` | Continue |
| `ui-pass` | Pass the story |
| `ui-pause` | Pause |
| `ui-play` | Play |
| `ui-next-track` | Next |
| `ui-replace` | Replace prompt |
| `ui-soften` | Soften Twist |
| `ui-stop-story` | Stop this story |
| `ui-tools` | Grown-up tools |
| `ui-listen` | Listen |
| `ui-read-aloud` | Read aloud |
| `ui-read-aloud-stop` | Stop reading (read-aloud button while speaking) |
| `ui-delete` | Delete |
| `ui-big-screen` | Big screen |
| `ui-back` | Back |
| `ui-close` | Close |
| `ui-check` | Picked |
| `ui-minus` | Fewer (player-count stepper) |
| `ui-plus` | More (player-count stepper) |
| `ui-person` | Player |
| `ui-players` | Storytellers |
| `ui-phone` | Phone |
| `ui-dice` | Surprise me |

### Card types

| id | Meaning |
|---|---|
| `card-world` | World |
| `card-quest` | Quest |
| `card-prompt` | Prompt |
| `card-twist` | Twist |
| `card-fate` | Fate |

### Ready-made worlds

| id | Meaning |
|---|---|
| `world-school` | School After the Bell |
| `world-jungle` | Jungle Explorers |
| `world-lantern` | The Moonlight Market |

### Build a World: Where? (10)

| id | Meaning |
|---|---|
| `where-city` | City |
| `where-jungle` | Jungle |
| `where-desert` | Desert |
| `where-forest` | Forest |
| `where-space` | Space |
| `where-under-the-sea` | Under the Sea |
| `where-school` | School |
| `where-museum` | Museum |
| `where-circus` | Circus |
| `where-spooky-house` | Spooky House (friendly ghost) |

### Build a World: When? (3)

| id | Meaning |
|---|---|
| `when-long-ago` | Long ago |
| `when-today` | Today |
| `when-future` | The Future |

### Build a World: What kind of story? (6)

| id | Meaning |
|---|---|
| `kind-adventure` | Adventure |
| `kind-mystery` | Mystery |
| `kind-funny` | Funny |
| `kind-fairy-tale` | Fairy Tale |
| `kind-superhero` | Superhero |
| `kind-space-story` | Space Story |

### Build a World: What's the quest? (6)

| id | Meaning |
|---|---|
| `quest-find-lost` | Find something lost |
| `quest-new-friend` | Help a new friend |
| `quest-deliver` | Deliver something special |
| `quest-solve-mystery` | Solve a mystery |
| `quest-fix-broken` | Fix something broken |
| `quest-big-party` | Get ready for a big party |

### Characters (8)

| id | Meaning |
|---|---|
| `char-inventor` | The Curious Inventor |
| `char-animal-friend` | The Animal Friend |
| `char-brave-beginner` | The Brave Beginner |
| `char-secret-keeper` | The Secret Keeper |
| `char-snack-chef` | The Snack Chef |
| `char-map-maker` | The Map Maker |
| `char-shortcut-finder` | The Shortcut Finder |
| `char-kind-helper` | The Kind Helper |

### Player shape markers (6, solid)

| id | Meaning |
|---|---|
| `shape-circle` | Circle |
| `shape-triangle` | Triangle |
| `shape-square` | Square |
| `shape-diamond` | Diamond |
| `shape-star` | Star |
| `shape-heart` | Heart |

### Levels

| id | Meaning |
|---|---|
| `level-sprout` | Story Sprout |
| `level-weaver` | Tale Weaver |
