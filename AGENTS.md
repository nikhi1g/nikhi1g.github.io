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
| `sawHalves >= 2` + `stairs > 0` | the paragraph was sawed in half from a hammered ladder |
| `catches >= 1` + `rod > 0` | the rod appeared and a word was fished off the page |
| `wiped` and `remains === 0` | the cleanup pass removed the socket and every loose piece |

Note which milestones are judged on their **peak** rather than the final
snapshot. Phases 7-9 exist to remove the mess, so the axe, the glass socket, the
pry bar and the caught words are all gone by the time a run ends; asserting on
the end state reports failure for correct behaviour. Anything the sequence
cleans up must be asserted on `peak`.

`catches` defaults to `1` rather than the whole sentence: the footer is fished
word by word at roughly 2.8s each, so a full sweep runs for minutes. Raise it
with `--expect-catches <n>` when testing the whole finale, and add
`--expect-cleanup` to require phases 7-9 to finish.

If you add a phase, add its milestone. An assertion that can't fail is worse
than no assertion.

### Options

| flag | default | purpose |
|---|---|---|
| `--root <dir>` | `.` | document root to serve |
| `--page <path>` | `/404.html` | page under test |
| `--timeout <s>` | `240` | milestone deadline |
| `--expect-debris <n>` | `3` | knocked-off glyph count |
| `--expect-catches <n>` | `1` | fished words required before passing |
| `--expect-cleanup` | off | also require the wipe/sweep/vacuum pass to finish (slow: minutes) |
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
  one. The harness disables background throttling; use it instead. This applies
  to any terminal/side-by-side browser pane too: a backgrounded tab never
  reaches the later phases at all, so `#saw` never gets built and the sequence
  looks stuck. To inspect art or state visually, drive your own headless Chrome
  with `--disable-background-timer-throttling`,
  `--disable-backgrounding-occluded-windows` and `--disable-renderer-backgrounding`
  (copy the launch flags from `harness.mjs`) and capture a clipped
  `Page.captureScreenshot` with a `scale` — magnifying the raster keeps stroke
  weights honest, whereas shrinking the viewBox exaggerates them.
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
| `404/js/wipe.js` | washcloth; lifts a fracture away stroke by stroke |
| `404/js/sweep.js` | broom; pushes loose pieces off the page edge |
| `404/js/vacuum.js` | suction for the leftovers, then throws itself away |
| `404/js/glass.js` | procedural impact-fracture decal |
| `404/js/damage.js` | damage stage classes and LIFO break/fix log |
| `404/js/gait.js` | walk, climb, lean, peer, hop and swing poses |
| `404/js/stairs.js` | ladder geometry, rungs and rails, platform registration, demolition |
| `404/css/*.css` | one stylesheet per concern, mirroring the modules |
| `404/test/harness.mjs` | console-error + milestone harness |

## The sequence

`creature.js` runs one linear sequence, each phase gated on the previous flag
and written so a wake mid-flight resumes rather than restarts:

1. **volley** — three arrows knock the `404` glyphs off.
2. **finale** — a thrown axe takes the theme icon; a fracture decal holds the socket.
3. **pry** — the axe handle levers the footer rule off, permanently removing
   that walkable surface.
4. **saw** — a ladder is hammered up to the paragraph and it is sawed in half.
5. **perch** — a ladder up to the heading's top edge, which becomes a real ledge;
   the scaffolding is wrecked behind it.
6. **fishing** — the footer sentence is fished out word by word.
7. **wipe** — climbs back to the shattered socket the axe left and wipes it
   away, one crack stroke at a time.
8. **sweep** — drops to the floor and brooms every loose piece out past the page
   edge.
9. **vacuum** — the catch-all: suctions what is left, then throws the vacuum
   itself off the edge.

Only one sequence ever runs at a time. Both the sleep event and the watchdog
start runs, and every walk wakes the dot — which fires another sleep event — so
without that gate two sequences hammer and climb the same ladder at once.

### Travel

`travelTo(goalX, standY, standOn)` is the only way the creature moves the page.
It travels in two moves, never diagonally: **walk** to the exact x it has to
climb from, then hammer a **ladder** straight up, one rung per swing, stepping
onto each rung as it appears. There are no staircases.

`standOn` is the ELEMENT that becomes the ledge, not a rect. It is registered
with `dot.anchorPlatform`, so the surface exists only while that element is on
the page and follows its box — the invariant that keeps every surface the
creature stands on something the user can actually see. Passing the previous
leg's ladder through with `{keep: true}` is what lets it travel in legs without
ever losing the rung under its feet; losing it would drop the creature out of
its climb pose and collapse it back into a ball.

A ladder is never faded away. Once the creature is on something real the whole
thing is **demolished**: rungs and rails stop being platforms and are handed to
the debris system to fall and clutter the floor, where the sweep and vacuum
passes collect them like anything else.

### The cursor

Sensing is measured as a gap to the **rig's** box (`.figure`), not `.dot` — the
ball is 20px and the sprouted figure is a ~30×74 SVG that overflows it, so
measuring `.dot` senses only the head.

- **A direct poke always wins**, even mid-phase: the creature hops up and away,
  curls into a ball, and watches the cursor suspiciously for `SCARE_MS` with its
  eye narrowed (`.wary`) and its pupil tracking the pointer. The stare is timed
  from the **landing**, because that is when the ball's eye appears. Release
  needs the cursor well clear (`SCARE_RELEASE`), or a still cursor re-triggers
  the hop forever. The ladder it was on is knocked down with it.
- **Mere proximity** only walks it away, and only while it is not `working` —
  otherwise a passing cursor drags the creature off its own ladder.

Only a user grab or drop curls the figure back into a ball. A fall or a scripted
hop does not: `dot.consumeDrop()` latches the release so the creature's own
motion is never mistaken for the user letting go.
