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
    const FLEE_RADIUS = 170;
    const FLEE_SPEED = 170;

    let started = false;
    let volleyDone = false;
    let finaleDone = false;
    let finaleTries = 0;
    let pryDone = false;
    let pryTries = 0;
    let sawDone = false;
    let sawTries = 0;
    let perchDone = false;
    let perchTries = 0;
    let fishDone = false;
    let wipeDone = false;
    let sweepDone = false;
    let vacuumDone = false;
    let working = false;
    let keepStairs = false;
    let runId = 0;
    let lastKick = 0;
    let mouseX = null;
    let mouseY = null;
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

    // The staircase is how the creature travels the page: it hammers treads up
    // to wherever it needs to stand, climbs them, and the scaffolding comes
    // down once it has somewhere real to stand. `stairs` owns the geometry and
    // registers every tread as a physics platform, so the climb is just the
    // normal walk with step-up.
    // Mirrors stairs.js WORK_REACH: the top tread lands one arm's reach below
    // the point the creature is aiming for.
    const STAND_OFFSET = 30;

    // One hammer swing, one tread: the tread appears as the swing lands, so the
    // staircase is literally hammered into place rather than fading in.
    const buildStairs = async (goalX, standY, keep) => {
        if (!stairs || !gait) return false;
        let planned = 0;
        try {
            planned = stairs.planTo(goalX, standY - STAND_OFFSET, {keep});
        } catch {
            return false;
        }
        if (!planned) return false;

        const from = dot.pos();
        gait.setFacing(goalX < from.x ? -1 : 1);
        for (let guard = 0; guard < 60 && !stairs.isComplete(); guard += 1) {
            markPoint(goalX, standY);
            await gait.swing('hammer');
            if (!stairs.buildNext()) break;
            await wait(160);
        }
        return stairs.isComplete();
    };

    // Climb the route one rung at a time. Each rung is a single scripted step of
    // fixed length with one limb cycle played over it, so the climb is a
    // sequence of discrete steps rather than a continuous blur — the old
    // drive-and-snap climb is what made it shake.
    const climbStairs = async (goalX, standY) => {
        if (!gait) return false;
        const ladder = typeof stairs.activeMode === 'function' && stairs.activeMode() === 'ladder';
        const cycleMs = ladder ? 620 : 540;
        const route = typeof stairs.route === 'function' ? stairs.route() : [];

        for (const tread of route) {
            const centre = (tread.left + tread.right) / 2;
            const footY = tread.y - dot.radius;
            const p = dot.pos();
            const alreadyThere = Math.abs(p.y - footY) < 2 && Math.abs(p.x - centre) < 6;
            if (alreadyThere) continue;
            const dir = centre < p.x ? -1 : 1;
            gait.stepClimb(dir, ladder ? 'ladder' : 'stairs');
            dot.stepTo(centre, footY, cycleMs);
            await wait(cycleMs + 60);
            if (Math.abs(dot.pos().y - standY) < dot.radius && Math.abs(dot.pos().x - goalX) < 24) break;
        }

        gait.stopClimb();
        gait.stop();
        return true;
    };

    // Close any remaining gap to the goal the way a person would: hop. Used when
    // the route ends a little short of where the work has to happen.
    const nudgeTo = async (goalX) => {
        const reach = 24;
        for (let attempt = 0; attempt < 6; attempt += 1) {
            const p = dot.pos();
            if (Math.abs(p.x - goalX) <= reach) return true;
            gait.hopDown(goalX < p.x ? -1 : 1);
            for (let guard = 0; guard < 40 && !dot.isGrounded(); guard += 1) await wait(60);
            await wait(140);
        }
        return Math.abs(dot.pos().x - goalX) <= reach * 2;
    };

    // Scaffolding is temporary: once the creature is up on something real, the
    // treads fade out from under it.
    const clearStairs = async () => {
        if (!stairs || !stairs.hasAny()) return;
        for (let guard = 0; guard < 60 && stairs.hasAny(); guard += 1) {
            stairs.teardownNext();
            await wait(90);
        }
    };

    // Travel to stand at (goalX, standY). With `standOn` the target rect becomes
    // a real ledge first, so the staircase can be cleared behind the creature;
    // without it the top tread stays, because the creature is standing on it.
    const travelTo = async (goalX, standY, standOn = null) => {
        const built = await buildStairs(goalX, standY, keepStairs);
        if (!built) return false;
        keepStairs = true;
        await climbStairs(goalX, standY);
        await nudgeTo(goalX);
        if (standOn) {
            dot.addPlatform(standOn.left, standOn.right, standOn.top);
            await clearStairs();
            keepStairs = false;
        }
        return true;
    };

    // The lever: a stand-in rule element takes the footer's top border, tilts
    // up off its far end while the creature leans, then tears free as debris.
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
        dot.el.classList.add('prying');
        dot.el.classList.toggle('face-left', dir < 0);

        // Load the lever, hold, then let it tear.
        await new Promise((r) => setTimeout(r, 260));
        bar.classList.add('is-levering');
        await new Promise((r) => setTimeout(r, 520));

        dot.el.classList.remove('prying');
        const torn = bar.getBoundingClientRect();
        bar.classList.remove('is-levering');
        bar.style.transition = 'none';
        dot.dropLine();
        dot.spawnDebris(bar, torn.left, torn.top, dir * -60, -90, dir * -140);
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

    const run = async (id) => {
        const ready = await waitForSprouted(id);
        if (!ready || !isCurrent(id)) return;

        // Phase 1: three arrows into the heading. A wake aborts the loop, but
        // the next sleep resumes on whatever letters are still standing.
        if (!volleyDone) {
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
            // DOM truth, not run freshness: no standing letters means done.
            if (splitHeading().length === 0) volleyDone = true;
            else if (isCurrent(id)) volleyDone = true;
            else return;
        }

        // Phase 2: one spinning axe at the theme icon. Same deterministic
        // shape as the arrows: the throw resolves on impact, then the icon
        // drops as debris and the fracture stays behind.
        if (volleyDone && !finaleDone && arrow && typeof arrow.fireAxe === 'function' && finaleTries < 3) {
            finaleTries += 1;
            const icon = document.getElementById('theme-toggle');
            markTarget(icon);
            if (!icon || !icon.isConnected) {
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
                        if (finaleTries >= 3) finaleDone = true;
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
        if (finaleDone && !pryDone && pryTries < 3) {
            pryTries += 1;
            await beat();
            try {
                await pryRule();
            } catch {
                if (pryTries >= 3) pryDone = true;
                return;
            }
            pryDone = true;
        }

        // Phase 4: the paragraph is out of reach, so hammer a staircase up to
        // it, climb, then saw it in half. `working` parks the flee reflex for
        // the duration — otherwise the cursor would drag the creature off its
        // own staircase mid-climb.
        if (pryDone && !sawDone && saw && typeof saw.sawThrough === 'function' && sawTries < 3) {
            sawTries += 1;
            const paragraph = document.querySelector('.message p');
            if (!paragraph || !paragraph.isConnected) {
                sawDone = true;
            } else {
                working = true;
                try {
                    await beat();
                    const rect = paragraph.getBoundingClientRect();
                    markTarget(paragraph);
                    // Stand one arm's length under the text so the saw bites
                    // through the middle of it. Never saw from where we happen
                    // to be: if the approach failed, walking away is wrong.
                    const arrived = await travelTo(rect.left + rect.width / 2, rect.bottom + 24);
                    if (!arrived) {
                        if (sawTries >= 3) sawDone = true;
                        return;
                    }
                    await beat();
                    await saw.sawThrough(paragraph);
                    sawDone = true;
                } catch {
                    if (sawTries >= 3) sawDone = true;
                } finally {
                    working = false;
                    gait.stop();
                }
            }
        }

        // Phase 5: climb on top of the heading. The stairs are cleared away the
        // moment it is up, and the heading itself becomes the ledge it fishes
        // from — scaffolding is only ever temporary.
        if (sawDone && !perchDone && perchTries < 3) {
            perchTries += 1;
            const heading = document.querySelector('.message h2');
            if (!heading || !heading.isConnected) {
                perchDone = true;
            } else {
                working = true;
                try {
                    await beat();
                    const rect = heading.getBoundingClientRect();
                    markTarget(heading);
                    // Only claim the perch if it actually got up there. Marking
                    // this done on a failed climb is what left it fishing from
                    // the floor while the sequence believed it was on the heading.
                    const up = await travelTo(rect.left + rect.width / 2, rect.top, rect);
                    if (up) perchDone = true;
                    else if (perchTries >= 3) perchDone = true;
                    else return;
                } catch {
                    if (perchTries >= 3) perchDone = true;
                } finally {
                    working = false;
                    gait.stop();
                }
            }
        }

        // Phase 6: fish the footer sentence out, letter by letter. Each catch is
        // hoisted off the page and flung back down to lie broken on the floor.
        // The show ends when the sentence is gone.
        if (perchDone && !fishDone && fishing && typeof fishing.fishOnce === 'function') {
            working = true;
            // The last staircase swing left the hammer in hand; the rod is what
            // this phase holds.
            gait.putAway();
            try {
                const words = splitSentence();
                for (const word of words) {
                    if (!word.isConnected) continue;
                    markTarget(word);
                    await fishing.fishOnce(word);
                    await wait(320);
                }
                fishing.hideRod();
                fishDone = true;
            } catch {
                if (fishing && typeof fishing.hideRod === 'function') fishing.hideRod();
                fishDone = true;
            } finally {
                working = false;
                gait.stop();
                gait.putAway();
            }
        }

        // Phase 7: clean up after itself. The socket the thrown axe left in the
        // header is the one mess the creature made on purpose to leave behind, so
        // it climbs back up to it and wipes it away — the cracks lift one stroke
        // at a time until the glass is gone.
        if (fishDone && !wipeDone && wipe && typeof wipe.wipeAway === 'function') {
            const socket = document.querySelector('.glass-hole');
            if (!socket || !socket.isConnected) {
                wipeDone = true;
            } else {
                working = true;
                try {
                    await beat();
                    const rect = socket.getBoundingClientRect();
                    markTarget(socket);
                    const there = await travelTo(rect.left + rect.width / 2, rect.top, rect);
                    if (!there) {
                        wipeDone = true;
                        return;
                    }
                    await beat();
                    await wipe.wipeAway(socket);
                    wipeDone = true;
                } catch {
                    wipeDone = true;
                } finally {
                    working = false;
                    gait.stop();
                    gait.putAway();
                }
            }
        }

        // Phase 8: back down to the floor, then sweep everything lying on it out
        // past the page edge. What is on the ground is exactly what the debris
        // system has resting, plus the knocked-off words.
        if (wipeDone && !sweepDone && sweep && typeof sweep.sweepAll === 'function') {
            working = true;
            try {
                await beat();
                markPoint(dot.pos().x, dot.world().ground);
                // Step off the ledge and let gravity do the descent.
                gait.hopDown(dot.pos().x < dot.world().left + 40 ? 1 : -1);
                for (let guard = 0; guard < 60 && !dot.isGrounded(); guard += 1) await wait(80);
                await wait(260);

                const world = dot.world();
                const onFloor = [...document.querySelectorAll('body > .letter, body > .word, body > .fish-catch, body > .bone-arrow, body > .bone-axe-thrown, body > .damage-fragment')]
                    .filter((el) => {
                        if (!el.isConnected) return false;
                        const r = el.getBoundingClientRect();
                        if (r.width < 1 || r.height < 1) return false;
                        // Loose means sitting on a floor, not perched on a ledge.
                        return r.bottom >= world.ground - 24;
                    });
                await sweep.sweepAll(onFloor);
                sweepDone = true;
            } catch {
                sweepDone = true;
            } finally {
                working = false;
                gait.stop();
                gait.putAway();
            }
        }

        // Phase 9: the last pass. Anything still on the page that should not be —
        // spent weapons, strays, anything not on the ground — goes into the
        // vacuum, and then the vacuum itself is thrown off the edge.
        if (sweepDone && !vacuumDone && vacuum && typeof vacuum.suckAll === 'function') {
            working = true;
            try {
                await beat();
                // The catch-all, so the page ends clean whatever the broom
                // missed: structural leftovers first, then any loose debris
                // still lying about.
                const strays = [...document.querySelectorAll(
                    'body > .bone-bow, body > .bone-rocket, body > .glass-hole, #version, .hint kbd, .bone-lasso, body > .stair, body > .ladder-rail, body > .stair-riser, body > .pried-rule, body > .thrown-vacuum,'
                    + ' body > .letter, body > .word, body > .fish-catch, body > .bone-arrow, body > .bone-axe-thrown, body > .damage-fragment'
                )].filter((el) => el && el.isConnected);
                markPoint(dot.pos().x, dot.world().ground);
                await vacuum.suckAll(strays);
                await vacuum.throwAway();
                vacuumDone = true;
            } catch {
                vacuumDone = true;
            } finally {
                working = false;
                gait.stop();
                gait.putAway();
            }
        }
    };

    const onSleepChange = (asleep) => {
        if (reduceMotion.matches) return;
        runId += 1;
        if (!asleep || (volleyDone && finaleDone && pryDone && sawDone && perchDone && fishDone && wipeDone && sweepDone && vacuumDone)) return;
        const id = runId;
        lastKick = performance.now();
        void run(id);
    };
    // Aggressive cursor flee: while sprouted, sprint away from a close mouse
    // and stop the moment it backs off. It runs through `gait` rather than
    // driving physics directly, so the leg cycle plays while it bolts.
    const updateFlee = () => {
        if (working || !dot.el.classList.contains('sprouted')) {
            if (fleeing) {
                fleeing = false;
                gait.stop();
            }
            return;
        }
        if (mouseX === null || mouseY === null) return;
        const p = dot.pos();
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        if (Math.hypot(dx, dy) < FLEE_RADIUS) {
            const dir = dx >= 0 ? 1 : -1;
            gait.walk(dir);
            fleeing = true;
        } else if (fleeing) {
            fleeing = false;
            gait.stop();
        }
    };

    // The creature watches the pointer while the pointer is being used, and
    // looks at what it is about to do once the pointer has gone quiet.
    const IDLE_MS = 900;
    let lastMouseMove = 0;
    let lookAt = null;

    const updateGaze = () => {
        if (!figure || typeof figure.setLookTarget !== 'function') return;
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
        // Watchdog: sleep events are the normal trigger, but a wake at the
        // wrong instant can strand a finished phase with no future event to
        // resume on. Re-kick while settled and incomplete.
        const kickTimer = setInterval(() => {
            if (volleyDone && finaleDone && pryDone && sawDone && perchDone && fishDone && wipeDone && sweepDone && vacuumDone) {
                clearInterval(kickTimer);
                return;
            }
            if (reduceMotion.matches) return;
            if (!dot.isAsleep() || !dot.el.classList.contains('sprouted')) return;
            if (performance.now() - lastKick < 3000) return;
            lastKick = performance.now();
            runId += 1;
            void run(runId);
        }, 2000);
        if (dot.isAsleep()) onSleepChange(true);
    };

    return {start};
}
