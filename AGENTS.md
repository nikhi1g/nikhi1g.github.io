# AGENTS.md — nikhi1g.github.io

Static site, no bundler, no dependencies: plain CSS and ES modules served
straight from the repo root. GitHub Pages serves `/404.html`, so that shell
stays at the root while every component lives under `404/`.

## Verify with the harness — never by eyeballing alone

`404/test/harness.mjs` is the regression net for the `/404.html` creature
sequence. It launches its own static server and its own headless Chrome,
attaches over the DevTools protocol, and fails on **both** console/page errors
and missing sequence milestones.

```bash
node 404/test/harness.mjs --allow commit.json
```

- Exit `0` = pass, `1` = assertion failure, `2` = harness itself broke.
- Prints every failure as `[kind] text`, then `HARNESS PASS|FAIL` plus the
  observed milestones, then a JSON report path.
- Takes ~17s for a full pass.

### Why milestones and not just errors

Every phase in `creature.js` wraps its await in `try/catch` so a scare or a
wake can't leave a half-broken page. That means **a thrown error produces no
console output** — the sequence just stops. Console capture alone reports a
clean run. The harness therefore also asserts the observable end state:

| milestone | meaning |
|---|---|
| `debris >= 3` | all three `404` glyphs knocked off as physics debris |
| `axe > 0` | the thrown axe was spawned |
| `hole > 0` | the fracture decal took the theme icon's socket |
| `iconHome === false` | the icon actually left the header |
| `ruleGone` + `rule > 0` | the footer rule was pried off and handed to physics |
| `sawHalves >= 2` + `stairs > 0` | the paragraph was sawed in half from a hammered staircase |
| `catches >= 1` + `rod > 0` | the rod appeared and a letter was fished off the page |

`catches` defaults to `1` rather than the whole sentence: the footer is fished
letter by letter at roughly 1.4s each, so a full sweep runs for minutes. Raise
it with `--expect-catches <n>` when you are testing the whole finale.

If you add a phase, add its milestone. An assertion that can't fail is worse
than no assertion.

### Options

| flag | default | purpose |
|---|---|---|
| `--root <dir>` | `.` | document root to serve |
| `--page <path>` | `/404.html` | page under test |
| `--timeout <s>` | `240` | milestone deadline |
| `--expect-debris <n>` | `3` | knocked-off glyph count |
| `--expect-catches <n>` | `1` | fished letters required before passing |
| `--no-axe` / `--no-hole` / `--no-pry` / `--no-saw` | off | skip finale milestones |
| `--allow <substr>` | — | repeatable console-error allowlist |
| `--report <path>` | tmp | JSON report destination |

`--allow commit.json` is expected on a local checkout: `version.js` polls
`/commit.json`, which only exists on the deployed site, so the 404 response is
noise rather than a regression.

## Working rules

- **Run the harness after any change under `404/`.** A green `node --check` is
  not verification; it only proves the file parses.
- **Never trust a preview pane as proof of failure.** Hidden/background pages
  get no animation frames, so a paused sequence looks identical to a broken
  one. The harness disables background throttling; use it instead.
- **Commit per file** with a scoped message (e.g. `404 arrow: …`), unless one
  logical change genuinely spans files.
- **No dependencies, no build step.** Plain CSS and ES modules only.
- **Respect `prefers-reduced-motion`.** Every animated module short-circuits
  under it; keep that path intact.
- Attribution stays with the art: the axe/hammer paths are Lucide icons under
  the ISC License.

## Layout

| path | owns |
|---|---|
| `404.html` | markup shell plus stylesheet/module links |
| `404/js/physics.js` | the simulation; exposes `drive`/`hop`/`spawnDebris`/`onStep` |
| `404/js/creature.js` | the phased sequence and the travel system (see below) |
| `404/js/arrow.js` | bow, arrow, rocket, thrown axe on shared ballistics |
| `404/js/saw.js` | hand saw; splits a target into two falling halves |
| `404/js/fishing.js` | rod, cast, hook, hoist and fling |
| `404/js/glass.js` | procedural impact-fracture decal |
| `404/js/damage.js` | damage stage classes and LIFO break/fix log |
| `404/js/gait.js` | walk, climb, lean, peer, hop and swing poses |
| `404/js/stairs.js` | stair geometry, tread elements, platform registration |
| `404/css/*.css` | one stylesheet per concern, mirroring the modules |
| `404/test/harness.mjs` | console-error + milestone harness |

## The sequence

`creature.js` runs one linear sequence, each phase gated on the previous flag
and written so a wake mid-flight resumes rather than restarts:

1. **volley** — three arrows knock the `404` glyphs off.
2. **finale** — a thrown axe takes the theme icon; a fracture decal holds the socket.
3. **pry** — the axe handle levers the footer rule off, permanently removing
   that walkable surface.
4. **saw** — stairs are hammered up to the paragraph and it is sawed in half.
5. **perch** — stairs up to the heading's top edge, which becomes a real ledge;
   the scaffolding is cleared behind it.
6. **fishing** — the footer sentence is fished out letter by letter.

### Travel

`travelTo(goalX, standY, standOn)` is the only way the creature moves the page:
hammer one tread per swing, climb, and — when `standOn` is given — promote that
rect to a real platform and clear the scaffolding. Passing the previous leg's
stairs through with `{keep: true}` is what lets it travel in legs without ever
losing the tread under its feet; losing it would drop the creature out of its
climb pose and collapse it back into a ball.

The flee reflex is parked for the whole of phases 4-6 (`working`), because
otherwise a passing cursor drags the creature off its own staircase.
