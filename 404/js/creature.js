import {glassHole} from './glass.js';

export function createCreature({dot, gait, stairs, saw, fishing, wipe, sweep, vacuum, arrow, figure}) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Every destructive act is separated by a beat: the creature sizes up the
    // next target instead of machine-gunning the page apart.
    const BEAT_MIN_MS = 1000;
    const BEAT_MAX_MS = 2000;
    const beat = () => new Promise((resolve) => {
        setTimeout(resolve, BEAT_MIN_MS + Math.random() * (BEAT_MAX_MS - BEAT_MIN_MS));
    });
    const wait = (ms) => new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
    // Pointer thresholds, all measured as a gap in CSS px from the rig's own
    // box (see pointerGap) rather than from the ball's centre.
    const FLEE_GAP = 140;        // walk away while the cursor is this close
    // Pace multipliers on the walk speed. The floor is a brisk walk, not a
    // shuffle: an eased curve off a 0.35 floor crawled at 20px/s halfway across
    // the box, which read as not fleeing at all.
    const FLEE_PACE_MIN = 1;     // already walking properly at the box edge
    const FLEE_PACE_MAX = 3.4;   // a full bolt with the cursor on top of it
    const SCARE_GAP = 4;         // hovering the body itself startles it
    const SCARE_RELEASE = 90;    // and it will not settle until the cursor is this far
    const SCARE_MS = 5000;       // how long the wary ball holds
    const SCARE_HOP_VY = 380;    // up
    const SCARE_HOP_VX = 160;    // and away
    // The saw stands back by the blade's reach and closer to the text than the
    // old arm's-length 24, so the spinning blade actually touches the line.
    const SAW_REACH = 13;
    const SAW_STANDOFF = 10;

    // Everything the creature can knock loose, as one selector. It lives in one
    // place because the sweep and the vacuum have to agree on what counts as a
    // loose piece — the demolished ladder's rungs and rails included.
    const LOOSE_SELECTOR = [
        '.letter',
        '.word',
        '.fish-catch',
        '.bone-arrow',
        '.bone-axe-thrown',
        '.damage-fragment',
        '.rule-shard',
        '.stair',
        '.ladder-rail'
    ].map((cls) => `body > ${cls}`).join(', ');

    // Phase tracing, for reporting where the sequence actually got to. Logged
    // via console.info so it is never mistaken for a page error by the harness.
    let tracedPhase = null;
    const phase = (name, detail) => {
        if (name === tracedPhase && !detail) return;
        tracedPhase = name;
        const extra = detail ? ` ${detail}` : '';
        console.info(`[404] phase: ${name}${extra}`);
    };
    // The remaining work, so a stalled run says what it is still waiting on.
    const pending = () => [
        ['volley', volleyDone], ['finale', finaleDone], ['pry', pryDone],
        ['saw', sawDone], ['perch', perchDone], ['fishing', fishDone],
        ['wipe', wipeDone], ['kick', kickDone], ['sweep', sweepDone],
        ['vacuum', vacuumDone]
    ].filter(([, done]) => !done).map(([name]) => name).join(',') || 'none';

    let started = false;
    let volleyDone = false;
    let finaleDone = false;
    // Attempts per phase. Generous on purpose: an interruption must never be
    // able to burn a phase, and only `attempt()` below increments these — an
    // interrupted try does not count at all.
    const PHASE_TRIES = 12;
    let finaleTries = 0;
    let pryTries = 0;
    let sawTries = 0;
    let perchTries = 0;
    let fishTries = 0;
    let wipeTries = 0;
    let sweepTries = 0;
    let vacuumTries = 0;
    let pryDone = false;
    let sawDone = false;
    let perchDone = false;
    let kickDone = false;
    let kickTries = 0;
    // The boot that clears the theme icon off the page: how far to the icon's
    // right it stands, and the launch it imparts — up and to the left, hard
    // enough to carry it past the edge.
    const KICK_STANCE = 22;
    const KICK_VX = 520;
    const KICK_VY = 640;
    const KICK_SPIN = -900;
    let fishDone = false;
    let wipeDone = false;
    let sweepDone = false;
    let vacuumDone = false;
    let working = false;
    let keepStairs = false;
    let runId = 0;
    let scared = false;
    let scareSettled = false;   // the hop has landed, so the stare can be timed
    let scareUntil = 0;
    let lastKick = 0;
    let mouseX = null;
    let mouseY = null;

    // An attempt was interrupted rather than failed: the user startled it or
    // picked it up. Interruptions must never count against a phase's attempts
    // and must never mark it done — the creature settles and picks it up again.
    const interrupted = () => scared || dot.isDragging();
    let fleeing = false;
    const isCurrent = (id) => id === runId && !reduceMotion.matches;

    const splitHeading = () => {
        const h1 = document.querySelector('h1');
        if (!h1) return [];
        if (!h1.querySelector('.letter')) {
            const chars = Array.from(h1.textContent);
            h1.replaceChildren();
            for (const ch of chars) {
                const span = document.createElement('span');
                span.className = 'letter';
                span.textContent = ch;
                h1.appendChild(span);
            }
        }
        return [...h1.querySelectorAll('.letter:not(.letter-gap)')].slice(0, 3);
    };

    const waitForSprouted = async (id) => {
        for (let i = 0; i < 60; i += 1) {
            if (!isCurrent(id)) return false;
            if (dot.el.classList.contains('sprouted')) return true;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return isCurrent(id) && dot.el.classList.contains('sprouted');
    };

    const knockOffLetter = (letter, impact) => {
        const rect = letter.getBoundingClientRect();
        if (!rect || rect.width < 1 || rect.height < 1) return;
        const h1 = letter.parentElement;

        const style = window.getComputedStyle(letter.parentElement || letter);
        if (style.font) letter.style.font = style.font;
        if (style.color) letter.style.color = style.color;
        if (style.lineHeight) letter.style.lineHeight = style.lineHeight;

        letter.style.position = 'fixed';
        letter.style.left = `${rect.left}px`;
        letter.style.top = `${rect.top}px`;
        letter.style.width = `${rect.width}px`;
        letter.style.height = `${rect.height}px`;
        letter.style.margin = '0';
        letter.style.zIndex = '3';
        letter.style.pointerEvents = 'none';
        if (h1) {
            const gap = document.createElement('span');
            gap.className = 'letter letter-gap';
            gap.textContent = letter.textContent;
            gap.style.visibility = 'hidden';
            h1.insertBefore(gap, letter);
        }

        document.body.appendChild(letter);
        const vx = impact && Number.isFinite(impact.vx)
            ? impact.vx * 0.18 + (Math.random() - 0.5) * 60
            : (Math.random() - 0.5) * 80;
        const vy = impact && Number.isFinite(impact.vy)
            ? -140 + impact.vy * 0.08
            : -140;
        dot.spawnDebris(letter, rect.left, rect.top, vx, vy, (Math.random() - 0.5) * 120);
    };

    // Axe finale: one spinning throw at the theme icon. The fracture decal
    // takes the icon's socket and the icon itself drops under real gravity.
    const knockOffIcon = (impact) => {
        const icon = document.getElementById('theme-toggle');
        if (!icon || !icon.isConnected) return;
        const rect = icon.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        if (!icon.dataset.yanked && !document.querySelector('.glass-hole')) {
            // The socket has to hold the icon's exact slot. The toggle is
            // pushed right by `margin-left: auto`, so copy the resolved
            // margins before the icon leaves the flow or the decal packs left.
            const iconStyle = window.getComputedStyle(icon);
            const hole = document.createElement('span');
            hole.className = 'glass-hole';
            hole.setAttribute('aria-hidden', 'true');
            hole.style.width = `${rect.width}px`;
            hole.style.height = `${rect.height}px`;
            hole.style.marginLeft = iconStyle.marginLeft;
            hole.style.marginRight = iconStyle.marginRight;
            hole.style.marginTop = iconStyle.marginTop;
            hole.style.marginBottom = iconStyle.marginBottom;
            hole.innerHTML = glassHole(Math.round(rect.width), Math.round(rect.height));
            icon.parentElement.insertBefore(hole, icon);
            icon.dataset.yanked = '1';
        }
        icon.style.position = 'fixed';
        icon.style.left = `${rect.left}px`;
        icon.style.top = `${rect.top}px`;
        icon.style.width = `${rect.width}px`;
        icon.style.height = `${rect.height}px`;
        icon.style.margin = '0';
        icon.style.zIndex = '5';
        icon.style.pointerEvents = 'none';
        document.body.appendChild(icon);
        const vx = impact && Number.isFinite(impact.vx)
            ? impact.vx * 0.1 + (Math.random() - 0.5) * 40
            : (Math.random() - 0.5) * 60;
        dot.spawnDebris(icon, rect.left, rect.top, vx, 80);
    };

    // Travel is legs first, then a ladder: the creature walks to the exact X it
    // has to climb from, then hammers rungs straight up — one swing, one rung,
    // stepping onto each rung as it is built. There is no staircase; the shaft
    // rises where it stands.
    // Mirrors stairs.js WORK_REACH: the top rung lands one arm's reach below
    // the point the creature is aiming for.
    const STAND_OFFSET = 30;

    const buildAndClimb = async (goalX, standY, keep) => {
        if (!stairs || !gait) return false;
        // Walk to the shaft's x before planning: the ladder rises from wherever
        // the creature stands, so arriving first keeps it vertical.
        if (!await walkTo(goalX)) return false;
        if (scared) return false;
        const shaftX = dot.pos().x;
        let planned = 0;
        try {
            planned = stairs.planTo(shaftX, standY - STAND_OFFSET, {keep});
        } catch {
            return false;
        }
        if (!planned) return false;

        const cycleMs = 620;
        gait.setFacing(goalX < shaftX ? -1 : 1);
        // Every stroke builds something: one raises the rails, the next lays the
        // rung, and only a laid rung is climbed. The guard is doubled because a
        // rung now costs two strokes.
        for (let guard = 0; guard < 130 && !stairs.isComplete(); guard += 1) {
            if (scared) {
                gait.stopClimb();
                gait.stop();
                return false;
            }
            markPoint(goalX, standY);
            await gait.swing('hammer');
            if (scared) {
                gait.stopClimb();
                gait.stop();
                return false;
            }
            const built = stairs.nextStroke();
            if (!built) break;
            if (built !== 'rung') continue;
            const rung = typeof stairs.lastBuilt === 'function' ? stairs.lastBuilt() : null;
            if (!rung) continue;
            const centre = (rung.left + rung.right) / 2;
            const p = dot.pos();
            gait.stepClimb(centre < p.x ? -1 : 1, 'ladder');
            dot.stepTo(centre, rung.y - dot.radius, cycleMs);
            await wait(cycleMs);
        }
        gait.stopClimb();
        gait.stop();
        return stairs.isComplete();
    };

    // Walk to an x position with the leg cycle actually playing. `gait.walk`
    // owns the animation; all this does is stop when it arrives, so the walk is
    // used for travelling along a surface instead of sliding.
    const walkTo = async (goalX, tolerance = 14) => {
        if (!gait) return false;
        for (let guard = 0; guard < 120; guard += 1) {
            if (scared) {
                gait.stop();
                return false;
            }
            const p = dot.pos();
            const gap = goalX - p.x;
            if (Math.abs(gap) <= tolerance) break;
            gait.walk(gap < 0 ? -1 : 1);
            await wait(70);
        }
        gait.stop();
        return Math.abs(dot.pos().x - goalX) <= tolerance * 2;
    };

    // The ladder is temporary, and it does not politely fade: once the creature
    // is standing on something real, the whole thing is knocked apart and the
    // rungs and rails fall to clutter the floor, where the sweep and vacuum
    // passes collect them like any other debris.
    const wreckLadder = async () => {
        if (!stairs || !stairs.hasAny()) return;
        await wait(120);
        stairs.demolish();
    };

    // Travel to stand at (goalX, standY). `standOn` is the ELEMENT that becomes
    // the ledge — anchored, so the surface lives and dies with the thing the
    // user can see — and once it is real the ladder is wrecked behind the
    // creature. Without it the top rung stays, because it is standing on it.
    //
    // Arrival is the top rung, full stop. There is deliberately no hop here:
    // `buildAndClimb` already walked to the target x before raising the shaft,
    // so the creature is under its goal when it tops out, and hopping at the
    // top only threw it off the ladder it had just built. Hops belong AFTER the
    // work — the perch jump onto the heading, and the drop back to the floor.
    const travelTo = async (goalX, standY, standOn = null) => {
        const raised = await buildAndClimb(goalX, standY, keepStairs);
        if (!raised) return false;
        keepStairs = true;
        if (standOn) {
            // Anchor the ledge, but DO NOT wreck the ladder yet. Knocking it
            // apart here destroyed the thing it had just built before it had
            // used it: the wipe still had to happen from up there, and with the
            // ladder gone the creature had nothing under it but the socket it
            // was about to erase. The caller wrecks it when the work is done.
            dot.anchorPlatform(standOn);
        }
        return true;
    };

    // The footer rule takes two blows. The first cracks it — the grey line above
    // "For any inquiries" shows fracture marks but holds. The second shatters it
    // into shards that rain down and settle on the floor, and the rule stops
    // being a surface the creature can stand on.
    const SHARDS = 110;

    const shatterRule = (bar, rect) => {
        bar.remove();
        for (let index = 0; index < SHARDS; index += 1) {
            const piece = document.createElement('span');
            piece.className = 'rule-shard';
            piece.setAttribute('aria-hidden', 'true');
            const x = rect.left + (rect.width * index) / SHARDS;
            const width = rect.width / SHARDS + 1;
            piece.style.position = 'fixed';
            piece.style.left = `${x}px`;
            piece.style.top = `${rect.top}px`;
            piece.style.width = `${width}px`;
            piece.style.height = `${Math.random() < 0.5 ? 1 : 2}px`;
            document.body.appendChild(piece);
            // Thrown outward and up a little, so the dust of it settles across
            // the whole floor rather than piling in one place.
            dot.spawnDebris(
                piece,
                x,
                rect.top,
                (Math.random() - 0.5) * 260,
                -70 - Math.random() * 170,
                (Math.random() - 0.5) * 900
            );
        }
    };

    const pryRule = async () => {
        const footer = document.querySelector('footer');
        markTarget(footer);
        if (!footer || footer.classList.contains('rule-gone')) return;
        const rect = footer.getBoundingClientRect();
        if (rect.width < 1) return;

        const bar = document.createElement('span');
        bar.className = 'pried-rule';
        bar.setAttribute('aria-hidden', 'true');
        // Inline, for the same reason the treads are: `body` is a flex
        // container and nothing appended to it may ever take layout width.
        bar.style.position = 'fixed';
        bar.style.left = `${rect.left}px`;
        bar.style.top = `${rect.top}px`;
        bar.style.width = `${rect.width}px`;
        document.body.appendChild(bar);
        // The real border hands over to the stand-in on the same frame.
        footer.classList.add('rule-gone');

        const dir = dot.pos().x > rect.left + rect.width / 2 ? 1 : -1;
        bar.style.transformOrigin = dir > 0 ? '0% 50%' : '100% 50%';
        dot.el.classList.toggle('face-left', dir < 0);

        try {
            // First blow: it cracks.
            await beat();
            await gait.swing('hammer');
            bar.classList.add('is-cracked');
            await wait(360);

            // Second blow: it shatters, and the floor it used to be is gone.
            await beat();
            await gait.swing('hammer');
            dot.dropLine();
            shatterRule(bar, rect);
        } catch {
            if (bar.isConnected) {
                dot.dropLine();
                shatterRule(bar, rect);
            }
        }
    };

    // The footer sentence is fished out one WORD at a time — a hook that takes a
    // single letter reads as a typo, a hook that takes a whole word reads as
    // fishing. Whitespace is left as plain text (it has no box to hook), and
    // #inquiry-commit is kept intact and fished as one catch at the end, because
    // version.js rewrites its textContent on every poll and would wipe any spans
    // inside it.
    const splitSentence = () => {
        const footer = document.querySelector('footer');
        const root = footer ? footer.querySelector('span') : null;
        if (!root) return [];
        const skip = root.querySelector('#inquiry-commit');

        if (!root.querySelector('.word')) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const texts = [];
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (!node.nodeValue || !node.nodeValue.trim()) continue;
                if (skip && skip.contains(node)) continue;
                texts.push(node);
            }
            for (const node of texts) {
                const fragment = document.createDocumentFragment();
                for (const piece of node.nodeValue.split(/(\s+)/)) {
                    if (!piece) continue;
                    if (!piece.trim()) {
                        fragment.appendChild(document.createTextNode(piece));
                        continue;
                    }
                    const span = document.createElement('span');
                    span.className = 'word';
                    span.textContent = piece;
                    fragment.appendChild(span);
                }
                node.parentNode.replaceChild(fragment, node);
            }
        }

        const words = [...root.querySelectorAll('.word')];
        if (skip && skip.isConnected) words.push(skip);
        return words;
    };

    // One sequence at a time. Both the sleep event and the watchdog start runs,
    // and every walk the creature takes wakes the dot — which fires another
    // sleep event. Without this gate those overlap and two sequences hammer and
    // climb the same ladder at once, which is what made it loop and fall off.
    // `runId` still owns abort; this only owns exclusivity.
    let active = false;
    let tracedPending = null;
    const run = async (id) => {
        if (active) return;
        active = true;
        try {
            await runSequence(id);
        } finally {
            active = false;
            // Reported only when it changes, so a stalled sequence logs once
            // rather than every watchdog kick.
            const left = pending();
            if (left !== tracedPending) {
                tracedPending = left;
                console.info(`[404] remaining: ${left}`);
            }
        }
    };

    // A phase that has genuinely failed PHASE_TRIES times is retired so the rest
    // of the sequence still runs. Interruptions never reach here — they do not
    // count as attempts — but a phase that truly cannot succeed (a target that
    // has come to rest somewhere unreachable, say) must not deadlock the
    // cleanup behind it, which is exactly what stalled the run before.
    const retireExhausted = () => {
        const gaveUp = (name, tries, done) => {
            if (done || tries < PHASE_TRIES) return done;
            phase(name, `gave up after ${tries} attempts`);
            return true;
        };
        finaleDone = gaveUp('finale', finaleTries, finaleDone);
        pryDone = gaveUp('pry', pryTries, pryDone);
        sawDone = gaveUp('saw', sawTries, sawDone);
        perchDone = gaveUp('perch', perchTries, perchDone);
        fishDone = gaveUp('fishing', fishTries, fishDone);
        wipeDone = gaveUp('wipe', wipeTries, wipeDone);
        kickDone = gaveUp('kick', kickTries, kickDone);
        sweepDone = gaveUp('sweep', sweepTries, sweepDone);
        vacuumDone = gaveUp('vacuum', vacuumTries, vacuumDone);
    };

    const runSequence = async (id) => {
        const ready = await waitForSprouted(id);
        if (!ready || !isCurrent(id)) return;
        retireExhausted();

        // Phase 1: three arrows into the heading. A wake aborts the loop, but
        // the next sleep resumes on whatever letters are still standing.
        if (!volleyDone) {
            phase('volley');
            if (!arrow || typeof arrow.fire !== 'function') return;
            const letters = splitHeading();
            markTarget(letters[0]);
            await beat();
            for (const letter of letters) {
                if (!isCurrent(id)) return;
                if (!dot.isAsleep()) return;
                if (!letter.isConnected) continue;
                const rect = letter.getBoundingClientRect();
                if (!rect || rect.width < 1 || rect.height < 1) continue;
                let impact = null;
                try {
                    impact = await arrow.fire(rect);
                } catch {
                    return;
                }
                if (!isCurrent(id)) return;
                if (letter.isConnected) {
                    try {
                        knockOffLetter(letter, impact);
                    } catch {
                        continue;
                    }
                }
                await beat();
            }
            // DOM truth, not run freshness: the volley is done when no letter is
            // left standing. Anything else — an interruption, a fumbled shot —
            // leaves it pending so the next run finishes the job.
            if (splitHeading().length === 0) volleyDone = true;
            else return;
        }

        // Phase 2: one spinning axe at the theme icon. Same deterministic
        // shape as the arrows: the throw resolves on impact, then the icon
        // drops as debris and the fracture stays behind.
        if (volleyDone && !finaleDone && arrow && typeof arrow.fireAxe === 'function' && finaleTries < PHASE_TRIES) {
            phase('finale', `try ${finaleTries + 1}`);
            const icon = document.getElementById('theme-toggle');
            markTarget(icon);
            if (!icon || !icon.isConnected) {
                // The target is genuinely gone: that is done, not a failure.
                finaleDone = true;
            } else {
                const rect = icon.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) {
                    finaleDone = true;
                } else {
                    let impact = null;
                    await beat();
                    try {
                        impact = await arrow.fireAxe(rect);
                    } catch {
                        // Interrupted throws cost nothing; a real failure costs
                        // one attempt. Either way the phase stays pending.
                        if (!interrupted()) finaleTries += 1;
                        return;
                    }
                    try {
                        knockOffIcon(impact);
                    } catch {
                        // The throw landed; a fumbled knock still ends the show.
                    }
                    finaleDone = true;
                }
            }
        }

        // Phase 3: pry the footer rule off. No projectile — the creature
        // plants the axe handle under the rule and leans on it, so the rule
        // levers up at one end, tears free, and falls. It was a walkable
        // surface, so the page loses a floor for good.
        if (finaleDone && !pryDone && pryTries < PHASE_TRIES) {
            phase('pry', `try ${pryTries + 1}`);
            await beat();
            try {
                await pryRule();
            } catch {
                if (!interrupted()) pryTries += 1;
                return;
            }
            pryDone = true;
        }

        // Phase 4: the paragraph is out of reach, so walk under it, hammer a
        // ladder up, climb it rung by rung, then saw the text in half. `working`
        // parks the flee reflex for the duration — otherwise the cursor would
        // drag the creature off its own ladder mid-climb.
        if (pryDone && !sawDone && saw && typeof saw.sawThrough === 'function' && sawTries < PHASE_TRIES) {
            phase('saw', `try ${sawTries + 1}`);
            const paragraph = document.querySelector('.message p');
            if (!paragraph || !paragraph.isConnected) {
                sawDone = true;
            } else {
                working = true;
                try {
                    await beat();
                    const rect = paragraph.getBoundingClientRect();
                    markTarget(paragraph);
                    // Stand so the BLADE meets the text, not so the body does.
                    // The saw is held out ahead of the fist, so standing dead
                    // under the centre put the blade off to one side of the
                    // words it was supposed to be cutting. Stand back by the
                    // blade's reach and face the cut, and the blade lands on
                    // the middle of the line; saw.js then derives the split
                    // from where the blade actually is.
                    const middle = rect.left + rect.width / 2;
                    const arrived = await travelTo(middle + SAW_REACH, rect.bottom + SAW_STANDOFF);
                    if (!arrived) {
                        if (!interrupted()) sawTries += 1;
                        return;
                    }
                    // The ladder left a hammer in hand; stow it before the cut
                    // so only the saw is held.
                    gait.putAway();
                    // Turn to the work: the blade is forward of the fist, so
                    // facing the cut is what points it at the text.
                    gait.setFacing(middle < dot.pos().x ? -1 : 1);
                    await beat();
                    await saw.sawThrough(paragraph);
                    sawDone = true;
                } catch {
                    if (!interrupted()) sawTries += 1;
                } finally {
                    working = false;
                    gait.stop();
                }
            }
        }

        // Phase 5: climb on top of the heading. The ladder is cleared away the
        // moment it is up, and the heading itself becomes the ledge it fishes
        // from — scaffolding is only ever temporary.
        if (sawDone && !perchDone && perchTries < PHASE_TRIES) {
            phase('perch', `try ${perchTries + 1}`);
            const heading = document.querySelector('.message h2');
            if (!heading || !heading.isConnected) {
                perchDone = true;
            } else {
                working = true;
                try {
                    await beat();
                    const rect = heading.getBoundingClientRect();
                    markTarget(heading);
                    const middle = rect.left + rect.width / 2;
                    // A ladder up to just below the heading's top edge. The last
                    // rung deliberately stops short so the hop is the last move
                    // rather than a formality.
                    const up = await travelTo(middle, rect.top + 30);
                    if (!up) {
                        if (!interrupted()) perchTries += 1;
                        return;
                    }
                    // Only NOW does the heading become a real surface: the
                    // creature is at the top of its ladder and lays the ledge
                    // from there, and the line draws itself out from the middle.
                    // Anchoring it before the climb made the line appear while
                    // it was still on the floor, out of nowhere.
                    dot.anchorPlatform(heading);
                    await wait(560);
                    // Aim the jump from the actual ballistics rather than a
                    // fixed impulse: a hard-clamped horizontal velocity cannot
                    // cross a wide gap, which is what left it short of the ledge
                    // and fishing from the floor. Solve for the arc instead.
                    const GRAVITY_PX = 981;
                    for (let attempt = 0; attempt < 4; attempt += 1) {
                        if (interrupted()) return;
                        const standing = dot.pos();
                        const gap = middle - standing.x;
                        const inside = standing.x > rect.left && standing.x < rect.right
                            && Math.abs(standing.y - (rect.top - dot.radius)) < 18;
                        if (inside) break;
                        // Rise needed to clear the ledge's top edge, plus margin.
                        const rise = Math.max(30, standing.y - (rect.top - dot.radius) + 14);
                        const vy = Math.sqrt(2 * GRAVITY_PX * rise);
                        const flight = (2 * vy) / GRAVITY_PX;
                        dot.hop(vy, gap / flight);
                        for (let guard = 0; guard < 70 && !dot.isGrounded(); guard += 1) await wait(50);
                        await wait(160);
                    }
                    const landed = dot.pos();
                    const onLedge = landed.x > rect.left && landed.x < rect.right
                        && Math.abs(landed.y - (rect.top - dot.radius)) < 20;
                    if (!onLedge) {
                        // Do not fish from the floor: come back for it rather
                        // than pretending it worked.
                        if (!interrupted()) perchTries += 1;
                        return;
                    }
                    await wait(200);
                    await wreckLadder();
                    keepStairs = false;
                    perchDone = true;
                } catch {
                    if (!interrupted()) perchTries += 1;
                } finally {
                    working = false;
                    gait.stop();
                }
            }
        }

        // Phase 6: fish the footer sentence out, letter by letter. Each catch is
        // hoisted off the page and flung back down to lie broken on the floor.
        // The show ends when the sentence is gone.
        if (perchDone && !fishDone && fishing && typeof fishing.fishOnce === 'function'
            && fishTries < PHASE_TRIES) {
            phase('fishing', `try ${fishTries + 1}`);
            working = true;
            // The last ladder rung left the hammer in hand; the rod is what
            // this phase holds.
            gait.putAway();
            try {
                const words = splitSentence();
                for (const word of words) {
                    if (interrupted()) break;
                    if (!word.isConnected) continue;
                    markTarget(word);
                    await fishing.fishOnce(word);
                    await wait(320);
                }
                fishing.hideRod();
                // Done only when the sentence is actually gone. An interruption
                // partway through leaves the rest standing, and the phase runs
                // again from wherever it left off.
                if (splitSentence().length === 0) fishDone = true;
                else if (!interrupted()) fishTries += 1;
            } catch {
                if (fishing && typeof fishing.hideRod === 'function') fishing.hideRod();
                if (!interrupted()) fishTries += 1;
            } finally {
                working = false;
                gait.stopClimb();
                gait.stop();
                gait.putAway();
            }
        }

        // Phase 7: clean up after itself. The socket the thrown axe left in the
        // header is the one mess the creature made on purpose to leave behind, so
        // it climbs back up to it and wipes it away — the cracks lift one stroke
        // at a time until the glass is gone.
        if (fishDone && !wipeDone && wipe && typeof wipe.wipeAway === 'function'
            && wipeTries < PHASE_TRIES) {
            phase('wipe', `try ${wipeTries + 1}`);
            const socket = document.querySelector('.glass-hole');
            if (!socket || !socket.isConnected) {
                wipeDone = true;
            } else {
                working = true;
                try {
                    await beat();
                    const rect = socket.getBoundingClientRect();
                    markTarget(socket);
                    const there = await travelTo(rect.left + rect.width / 2, rect.top, socket);
                    if (!there) {
                        // The climb was cut short — come back for the glass.
                        if (!interrupted()) wipeTries += 1;
                        return;
                    }
                    await beat();
                    await wipe.wipeAway(socket);
                    // The glass is gone, so the ledge it was standing on has
                    // gone with it. Knock the ladder down NOW — after the work,
                    // not before it — and drop back to the floor under gravity,
                    // so the next phase starts from a settled creature instead
                    // of one stranded at the top of a ladder it no longer has.
                    wipeDone = true;
                    await wreckLadder();
                    keepStairs = false;
                    for (let guard = 0; guard < 60 && !dot.isGrounded(); guard += 1) await wait(80);
                } catch {
                    if (!interrupted()) wipeTries += 1;
                } finally {
                    working = false;
                    gait.stop();
                    gait.putAway();
                }
            }
        }

        // Phase 8: the theme icon has been lying where the axe dropped it since
        // phase 2. The creature drops to the floor, builds a ladder on the icon's
        // RIGHT so it ends up standing beside it facing left, and boots it clean
        // off the page — up and away to the left, ignoring walls and floors.
        if (wipeDone && !kickDone && kickTries < PHASE_TRIES) {
            phase('kick', `try ${kickTries + 1}`);
            const icon = document.getElementById('theme-toggle');
            if (!icon || !icon.isConnected) {
                kickDone = true;
            } else {
                working = true;
                try {
                    await beat();
                    const rect = icon.getBoundingClientRect();
                    markTarget(icon);
                    // Stand on the icon's right, a stride away. The stance has
                    // to be CLAMPED inside the walkable world: the icon usually
                    // comes to rest near the right-hand wall, and a goal past
                    // that wall can never be reached, so the approach failed
                    // forever and the phase sat there retrying.
                    const world = dot.world();
                    const from = Math.min(rect.right + KICK_STANCE, world.right - 1);
                    // No ladder when the icon is already down on the floor —
                    // a one-rung ladder to nowhere is just a stumble.
                    const onFloor = Math.abs(rect.bottom - (world.ground + dot.radius)) < 28;
                    const there = onFloor
                        ? await walkTo(from, 10)
                        : await travelTo(from, rect.bottom);
                    if (!there) {
                        if (!interrupted()) kickTries += 1;
                        phase('kick', `approach failed (from=${Math.round(from)})`);
                        return;
                    }
                    await beat();
                    if (interrupted()) return;
                    // Face the icon and boot it: up and to the left, with a
                    // hard spin. `escape` is what lets it leave the page instead
                    // of bouncing off the card wall.
                    const launched = await new Promise((resolve) => {
                        void gait.kick(-1, () => {
                            // The icon has been resting in the debris list since
                            // the axe dropped it, so a kick normally just
                            // re-launches that entry. If it is not there — swept
                            // up, or never made debris — spawn it as escaping
                            // debris from where it sits, so the boot always
                            // lands and the phase cannot stall on a false.
                            if (dot.kickDebris(icon, -KICK_VX, -KICK_VY, KICK_SPIN, true)) {
                                resolve(true);
                                return;
                            }
                            const now = icon.getBoundingClientRect();
                            dot.spawnDebris(icon, now.left, now.top, -KICK_VX, -KICK_VY, KICK_SPIN);
                            resolve(dot.kickDebris(icon, -KICK_VX, -KICK_VY, KICK_SPIN, true));
                        });
                    });
                    await wait(260);
                    // The icon may have been swept up or never been debris at
                    // all; either way there is nothing left to kick.
                    if (launched || !icon.isConnected) kickDone = true;
                    else if (!interrupted()) kickTries += 1;
                } catch {
                    if (!interrupted()) kickTries += 1;
                } finally {
                    working = false;
                    gait.stop();
                    gait.putAway();
                }
            }
        }

        // Phase 9: back down to the floor, then sweep everything lying on it out
        // past the page edge. What is on the ground is exactly what the debris
        // system has resting, plus the knocked-off words.
        if (kickDone && !sweepDone && sweep && typeof sweep.sweepAll === 'function'
            && sweepTries < PHASE_TRIES) {
            phase('sweep', `try ${sweepTries + 1}`);
            working = true;
            try {
                await beat();
                markPoint(dot.pos().x, dot.world().ground);
                // Step off the ledge and let gravity do the descent.
                gait.hopDown(dot.pos().x < dot.world().left + 40 ? 1 : -1);
                for (let guard = 0; guard < 60 && !dot.isGrounded(); guard += 1) await wait(80);
                await wait(260);
                // Walk along the floor to the nearest loose piece, so the leg
                // cycle plays instead of the creature sliding into position.
                const nearest = [...document.querySelectorAll(LOOSE_SELECTOR)]
                    .filter((el) => el.isConnected)
                    .map((el) => el.getBoundingClientRect())
                    .filter((r) => r.width >= 1)
                    .sort((a, b) => Math.abs(a.left - dot.pos().x) - Math.abs(b.left - dot.pos().x))[0];
                if (nearest) await walkTo(nearest.left + nearest.width / 2);

                const world = dot.world();
                const onFloor = [...document.querySelectorAll(LOOSE_SELECTOR)]
                    .filter((el) => {
                        if (!el.isConnected) return false;
                        const r = el.getBoundingClientRect();
                        if (r.width < 1 || r.height < 1) return false;
                        // Loose means sitting on a floor, not perched on a ledge.
                        return r.bottom >= world.ground - 24;
                    });
                await sweep.sweepAll(onFloor);
                // Done when the floor is actually clear; an interrupted sweep
                // leaves pieces behind and runs again.
                if (onFloor.every((el) => !el.isConnected)) sweepDone = true;
                else if (!interrupted()) sweepTries += 1;
            } catch {
                if (!interrupted()) sweepTries += 1;
            } finally {
                working = false;
                gait.stopClimb();
                gait.stop();
                gait.putAway();
            }
        }

        // Phase 10: the last pass. Anything still on the page that should not be —
        // spent weapons, strays, anything not on the ground — goes into the
        // vacuum, and then the vacuum itself is thrown off the edge.
        if (sweepDone && !vacuumDone && vacuum && typeof vacuum.suckAll === 'function'
            && vacuumTries < PHASE_TRIES) {
            phase('vacuum', `try ${vacuumTries + 1}`);
            working = true;
            try {
                await beat();
                // The catch-all, so the page ends clean whatever the broom
                // missed: structural leftovers first, then any loose debris
                // still lying about.
                const strays = [...document.querySelectorAll(
                    'body > .bone-bow, body > .bone-rocket, body > .glass-hole, #version, .hint kbd,'
                    + ' .bone-lasso, body > .pried-rule, body > .thrown-vacuum, '
                    + LOOSE_SELECTOR
                )].filter((el) => el && el.isConnected);
                markPoint(dot.pos().x, dot.world().ground);
                await vacuum.suckAll(strays);
                await vacuum.throwAway();
                if (strays.every((el) => !el.isConnected)) vacuumDone = true;
                else if (!interrupted()) vacuumTries += 1;
            } catch {
                if (!interrupted()) vacuumTries += 1;
            } finally {
                working = false;
                gait.stopClimb();
                gait.stop();
                gait.putAway();
            }
        }
    };

    // Every phase finished: the one condition that retires the sequence, the
    // watchdog and the cursor reflex's restart alike.
    const allDone = () => volleyDone && finaleDone && pryDone && sawDone
        && perchDone && fishDone && wipeDone && kickDone && sweepDone && vacuumDone;

    // The dot settling is the normal trigger to (re)start the sequence.
    const onSleepChange = (asleep) => {
        if (reduceMotion.matches) return;
        runId += 1;
        if (scared || !asleep || allDone()) return;
        const id = runId;
        lastKick = performance.now();
        void run(id);
    };

    // How far the cursor is from the creature, in CSS px, measured to the
    // nearest edge of its box — 0 while the cursor is over it.
    //
    // The box has to be the RIG's, not `.dot`'s: `.dot` is the 20px ball, and
    // the sprouted figure is a ~30x74 SVG that overflows it. Measuring `.dot`
    // senses only the head, so hovering the body did nothing and the distance
    // to the torso read as far away.
    const senseBox = () => {
        const rig = dot.el.classList.contains('sprouted')
            ? dot.el.querySelector('.figure')
            : null;
        const box = (rig || dot.el).getBoundingClientRect();
        return box && (box.width >= 1 || box.height >= 1) ? box : null;
    };

    const pointerGap = () => {
        if (mouseX === null || mouseY === null) return Infinity;
        const box = senseBox();
        if (!box) return Infinity;
        const dx = Math.max(box.left - mouseX, 0, mouseX - box.right);
        const dy = Math.max(box.top - mouseY, 0, mouseY - box.bottom);
        return Math.hypot(dx, dy);
    };

    // Which way is away from the cursor, along x.
    const awayFromPointer = () => {
        const box = senseBox();
        const centre = box ? box.left + box.width / 2 : dot.pos().x;
        return centre - mouseX >= 0 ? 1 : -1;
    };

    // Hovering the figure itself startles it: it hops up and away, curls into a
    // ball, and watches the cursor suspiciously for SCARE_MS. Whatever it was
    // doing is aborted — every phase's `finally` stands down the tool in hand —
    // and it picks the sequence back up once it settles.
    //
    // A poke always wins, even mid-phase. The ladder it was on is knocked down
    // with it: leaving one standing would strand a half-built route for the
    // next leg to continue from, and the pieces belong on the floor with the
    // rest of the debris anyway.
    const startScare = () => {
        runId += 1;
        scared = true;
        scareSettled = false;
        const away = awayFromPointer();
        setFleeing(0);
        gait.stopClimb();
        gait.putAway();
        gait.setFacing(away);
        if (stairs && stairs.hasAny()) stairs.demolish();
        keepStairs = false;
        dot.hop(SCARE_HOP_VY, away * SCARE_HOP_VX);
        if (figure && typeof figure.curlUp === 'function') figure.curlUp();
    };

    const endScare = () => {
        scared = false;
        if (figure && typeof figure.sproutFigure === 'function') figure.sproutFigure();
        if (reduceMotion.matches) return;
        if (allDone()) return;
        lastKick = performance.now();
        runId += 1;
        void run(runId);
    };

    // Backing away and narrowing the eye are the same state, so they are set
    // together from one alarm level (0 = calm, 1 = cursor on top of it) and the
    // squint can never be left on after it stops retreating.
    const setFleeing = (alarm) => {
        fleeing = alarm > 0;
        if (!fleeing) gait.stop();
        if (figure && typeof figure.setSquint === 'function') figure.setSquint(alarm);
    };

    const updateFlee = () => {
        const gap = pointerGap();
        if (scared) {
            // The ball's eye only shows once it is settled, so the suspicious
            // stare is timed from the landing, not from the hop — otherwise
            // most of it elapses mid-air with no eye on screen to see it.
            if (!scareSettled) {
                if (!dot.isGrounded()) return;
                scareSettled = true;
                scareUntil = performance.now() + SCARE_MS;
                return;
            }
            // Hysteresis: the cursor has to retreat well clear of the rig, not
            // merely off it, or a stationary cursor re-triggers the startle the
            // instant the ball unfolds and it hops over and over.
            if (gap >= SCARE_RELEASE && performance.now() >= scareUntil) endScare();
            return;
        }
        // A direct poke always startles, even mid-phase: it is the one cursor
        // interaction the creature never ignores.
        if (gap <= SCARE_GAP && !reduceMotion.matches
            && dot.el.classList.contains('sprouted')) {
            startScare();
            return;
        }
        // Mere proximity only walks it away, and only when it is not working —
        // otherwise a cursor drifting past drags it off its own ladder.
        if (working || !dot.el.classList.contains('sprouted')) {
            if (fleeing) setFleeing(0);
            return;
        }
        if (gap < FLEE_GAP) {
            // Alarm rises continuously across the flee box: 0 at its edge, 1
            // when the cursor is right on the figure. Both how fast it retreats
            // and how far its eye narrows are read off this one value, so the
            // two always agree — it is most suspicious exactly when it is most
            // hurried. Outside the box alarm is 0 and it is left alone.
            const alarm = Math.min(1, Math.max(0,
                (FLEE_GAP - gap) / (FLEE_GAP - SCARE_GAP)));
            // Pace builds gently at first and hard near the end, but off a
            // brisk floor so it is always plainly running away.
            const urgency = alarm * alarm;
            gait.walk(awayFromPointer(), FLEE_PACE_MIN + (FLEE_PACE_MAX - FLEE_PACE_MIN) * urgency);
            // The eye narrows FASTER than the pace builds — square-rooted, so it
            // is already visibly suspicious while the cursor is still some way
            // off and reaches full narrowness before the cursor arrives.
            setFleeing(Math.sqrt(alarm));
        } else if (fleeing) {
            setFleeing(0);
        }
    };

    // The creature watches the pointer while the pointer is being used, and
    // looks at what it is about to do once the pointer has gone quiet.
    const IDLE_MS = 900;
    let lastMouseMove = 0;
    let lookAt = null;

    const updateGaze = () => {
        if (!figure || typeof figure.setLookTarget !== 'function') return;
        // While startled the eye stays on the mouse: clearing the work target
        // lets the gaze fall back to the pointer, narrowed by the wary class.
        if (scared) {
            figure.setLookTarget(null);
            return;
        }
        const idle = performance.now() - lastMouseMove > IDLE_MS;
        figure.setLookTarget(idle ? lookAt : null);
    };

    // Called at the start of each destructive act with the thing being worked on.
    const markTarget = (element) => {
        if (!element) {
            lookAt = null;
            return;
        }
        try {
            const rect = element.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) {
                lookAt = null;
                return;
            }
            lookAt = {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
        } catch {
            lookAt = null;
        }
    };

    // For work with no element to stare at — building, travelling — look at the
    // place it is heading.
    const markPoint = (x, y) => {
        lookAt = Number.isFinite(x) && Number.isFinite(y) ? {x, y} : null;
    };

    const start = () => {
        if (started || reduceMotion.matches) return;
        started = true;
        window.addEventListener('mousemove', (event) => {
            mouseX = event.clientX;
            mouseY = event.clientY;
            lastMouseMove = performance.now();
        });
        dot.onStep(updateFlee);
        dot.onStep(updateGaze);
        dot.onSleepChange(onSleepChange);
        // Watchdog: sleep events are the normal trigger, but a wake at the wrong
        // instant can strand a phase with no future event to resume on — and if
        // the creature is already settled there is no next sleep transition to
        // wait for. This is the only thing that guarantees the sequence carries
        // on by itself.
        //
        // It deliberately does NOT require `sprouted`, and accepts grounded as
        // well as asleep. Requiring both meant that a creature left unsettled —
        // say the ledge it stood on was erased by its own wipe — was never
        // re-kicked at all, and the run only continued once the user poked it.
        const kickTimer = setInterval(() => {
            if (allDone()) {
                clearInterval(kickTimer);
                return;
            }
            if (reduceMotion.matches) return;
            if (scared || dot.isDragging()) return;
            if (!dot.isAsleep() && !dot.isGrounded()) return;
            if (performance.now() - lastKick < 3000) return;
            lastKick = performance.now();
            runId += 1;
            void run(runId);
        }, 2000);
        if (dot.isAsleep()) onSleepChange(true);
    };

    return {start};
}
