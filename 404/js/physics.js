export function createDot() {
    const mainEl = document.querySelector('main');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Real physics for the status dot: MKS units scaled to pixels, à la Box2D's
    // pixels-per-meter convention, with a coefficient of restitution and a sleep
    // threshold as in the standard canvas bouncing-ball implementations.
    const statusDot = document.querySelector('.dot');
    const dotSlot = document.querySelector('.dot-slot');
    const footerEl = document.querySelector('footer');
    const dotRadius = 10;
    const pixelsPerMetre = 100;                        // the 20px dot is a 20cm ball
    const gravity = 9.81 * pixelsPerMetre;             // 981 px/s^2
    const restitution = 0.58;                          // damped enough to settle quickly
    const wallRestitution = 0.4;
    const airDrag = 0.3;                               // per second, linear damping
    const sleepSpeed = 0.5 * pixelsPerMetre;           // vertical speed that stops a bounce
    const sleepCreep = 0.08 * pixelsPerMetre;          // horizontal speed that ends a roll
    const rollResistance = 4.5;                        // rolling drag once the user is in charge
    const physicsStep = 1 / 240;                       // fixed timestep keeps bounces stable
    // The load shove, chosen once, is the only self-propelled motion: it carries the dot
    // off the rule on arrival. After that the dot is inert and obeys whatever the user does.
    const rollVector = 14 + Math.random() * 46;        // px/s of initial rightward drift
    const rollPush = rollVector * 2.4;                 // px/s^2 sustaining that first roll
    const rollCreep = 78;                              // px/s the launch roll decays toward
    const rollFriction = rollPush / rollCreep;         // drag ∝ the shove, so creep is fixed
    // Deceleration used to ease the launch roll into its stop at the end of the
    // rule. At the creep speed of 78px/s this brakes over roughly 43px, which
    // is a visible slowdown rather than a stop you could miss or feel as a wall.
    const rollBrake = 70;                              // px/s^2
    let dotSelfRoll = true;                            // cleared for good on first user touch
    let dotX = 0;
    let dotY = 0;
    let dotVX = 0;
    let dotVY = 0;
    let dotLastTime;
    let dotAccumulator = 0;
    let dotDragging = false;
    let dotPointerX = 0;
    let dotPointerY = 0;
    let dotDragTime = 0;
    // Latched on release: the next wake this causes is a user drop, which is
    // one of the two things allowed to curl the figure back into a ball.
    let userDrop = false;
    let dotAsleep = false;
    const sleepListeners = [];
    const onSleepChange = (fn) => {
        sleepListeners.push(fn);
    };
    let driven = false;              // creature is walking: it owns vx, not friction
    let contactNow = false;          // touching a surface as of the last step
    let surfaceNow = null;           // 'line' | 'ground' | null
    const stepListeners = [];
    const debris = [];
    const onStep = (fn) => {
        stepListeners.push(fn);
    };
    const placeDot = () => {
        statusDot.style.left = `${dotX - dotRadius}px`;
        statusDot.style.top = `${dotY - dotRadius}px`;
    };
    // The footer rule is a real floor until the creature pries it off; after
    // that the card bottom is the only fixed surface left.
    let lineGone = false;
    const dropLine = () => {
        lineGone = true;
    };
    const dotWorld = () => {
        const card = mainEl.getBoundingClientRect();
        const footer = footerEl.getBoundingClientRect();
        return {
            left: card.left + dotRadius,
            right: card.right - dotRadius,
            top: card.top + dotRadius,
            ground: card.bottom - dotRadius,
            lineY: footer.top - dotRadius,
            lineLeft: footer.left,
            lineRight: footer.right,
            lineGone
        };
    };
    // Every walkable surface, in one list: the footer rule, the card floor, and any
    // platform the creature has built. Each is {y, left, right, kind}.
    //
    // A platform may instead be ANCHORED to a page element. It then exists only
    // for as long as that element is on the page, and it follows the element's
    // box. That is the invariant that keeps the creature honest: every surface
    // it can stand on is something visible. An unanchored platform is owned by
    // whoever registered it and must be removed by hand.
    const platforms = [];
    let platformSeq = 0;
    const addPlatform = (left, right, y) => {
        const id = ++platformSeq;
        platforms.push({id, left, right, y: y - dotRadius, kind: 'platform'});
        return id;
    };
    const anchorPlatform = (element) => {
        if (!element) return 0;
        // Idempotent: a phase that retries its approach anchors the same ledge
        // again, and stacking duplicate surfaces on one element is never right.
        const existing = platforms.find((platform) => platform.el === element);
        if (existing) return existing.id;
        const id = ++platformSeq;
        platforms.push({id, el: element, left: 0, right: 0, y: 0, kind: 'platform'});
        refreshAnchors();
        return id;
    };
    const dropPlatform = (index) => {
        platforms.splice(index, 1);
    };
    // Resolved once per animation frame rather than per surface query: the
    // integrator runs at a fixed 240Hz substep and asks for surfaces several
    // times per step, and a getBoundingClientRect per platform per substep is
    // a layout read the simulation does not need.
    const refreshAnchors = () => {
        for (let i = platforms.length - 1; i >= 0; i -= 1) {
            const platform = platforms[i];
            if (!platform.el) continue;
            if (!platform.el.isConnected) {
                dropPlatform(i);
                continue;
            }
            const box = platform.el.getBoundingClientRect();
            if (box.width < 1 || box.height < 1) {
                dropPlatform(i);
                continue;
            }
            platform.left = box.left;
            platform.right = box.right;
            platform.y = box.top - dotRadius;
        }
    };
    const removePlatform = (id) => {
        const i = platforms.findIndex((p) => p.id === id);
        if (i >= 0) dropPlatform(i);
    };
    const surfacesAt = (x) => {
        const world = dotWorld();
        const list = [{y: world.ground, left: world.left, right: world.right, kind: 'ground'}, ...platforms];
        if (!world.lineGone) {
            list.push({y: world.lineY, left: world.lineLeft, right: world.lineRight, kind: 'line'});
        }
        return list.filter((s) => x >= s.left && x <= s.right);
    };
    // The surface a falling dot lands on: the highest one it was above before this step.
    const floorUnder = (x, prevY) => {
        let best = null;
        for (const s of surfacesAt(x)) {
            if (prevY > s.y + 0.5) continue;
            if (!best || s.y < best.y) best = s;
        }
        return best;
    };
    const standingOn = (x, y) => surfacesAt(x).find((s) => Math.abs(y - s.y) < 0.5) || null;
    const stepDot = (dt) => {
        // A scripted climb step owns the dot for its duration: eased, grounded,
        // and velocity-free, so nothing snaps and the figure never wakes.
        if (stepGoal) {
            const t = Math.min(1, (performance.now() - stepStarted) / stepDuration);
            const eased = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
            dotX = stepFrom.x + (stepGoal.x - stepFrom.x) * eased;
            dotY = stepFrom.y + (stepGoal.y - stepFrom.y) * eased;
            dotVX = 0;
            dotVY = 0;
            contactNow = true;
            surfaceNow = 'platform';
            if (t >= 1) clearStep();
            return;
        }
        const world = dotWorld();
        const resting = standingOn(dotX, dotY);
        const contact = !!resting && dotVY === 0;
        contactNow = contact;
        surfaceNow = contact ? resting.kind : null;
        if (contact && driven) {
            // Walking: the creature holds vx steady, so no rolling resistance applies.
        } else if (contact && resting.kind === 'line' && dotSelfRoll) {
            // Launch roll only: resistance scales with the shove, so any shove bleeds
            // down to the same gentle creep before it reaches the end of the rule.
            dotVX += (rollPush - rollFriction * dotVX) * dt;
        } else if (contact) {
            dotVX -= dotVX * rollResistance * dt;   // plain rolling resistance
            if (Math.abs(dotVX) < sleepCreep) dotVX = 0;
        } else {
            dotVY += gravity * dt;                      // constant g, the whole way down
            dotVX -= dotVX * airDrag * dt;
        }
        const prevY = dotY;
        dotX += dotVX * dt;
        dotY += dotVY * dt;
        if (dotX < world.left || dotX > world.right) {
            dotX = Math.max(world.left, Math.min(world.right, dotX));
            dotVX *= -wallRestitution;
        }
        // The launch roll ends AT the end of the footer rule, one ball's radius
        // in, and never runs off it: it is delivered onto that line and should
        // come to rest on it, meeting the floor only later, once the creature
        // pries the line away.
        //
        // It BRAKES to that stop rather than hitting it. Clamping the position
        // and zeroing the velocity stopped it dead on the spot, which read as
        // hitting a wall. Instead the speed is capped by how much room is left:
        // v <= sqrt(2 * a * remaining) is exactly the speed from which a
        // constant deceleration `a` comes to rest at the edge and no sooner, so
        // the ball eases in and settles instead of slamming.
        if (dotSelfRoll && !lineGone) {
            const rollEnd = world.lineRight - dotRadius;
            const rollStart = world.lineLeft + dotRadius;
            if (dotVX > 0) {
                const room = Math.max(0, rollEnd - dotX);
                const ceiling = Math.sqrt(2 * rollBrake * room);
                if (dotVX > ceiling) dotVX = ceiling;
            } else if (dotVX < 0) {
                const room = Math.max(0, dotX - rollStart);
                const ceiling = Math.sqrt(2 * rollBrake * room);
                if (dotVX < -ceiling) dotVX = -ceiling;
            }
            // Only a backstop now: with the brake above the ball arrives with
            // almost no speed left, so this trims the last fraction of a pixel.
            if (dotX > rollEnd) dotX = rollEnd;
            else if (dotX < rollStart) dotX = rollStart;
            if (Math.abs(dotVX) < sleepCreep && (dotX >= rollEnd || dotX <= rollStart)) dotVX = 0;
        }
        if (dotY < world.top) {
            dotY = world.top;
            dotVY = Math.abs(dotVY) * restitution;
        }
        // Step-up: a walking creature climbs a small rise (a stair) instead of walking
        // into it. Only while driven and grounded, so a thrown ball cannot climb.
        if (driven && dotVY === 0) {
            const stepUp = 18;
            let ledge = null;
            for (const s of surfacesAt(dotX)) {
                if (s.y >= prevY - 0.5) continue;            // not above us
                if (prevY - s.y > stepUp) continue;          // too tall to step onto
                if (!ledge || s.y > ledge.y) ledge = s;      // the lowest reachable rise
            }
            if (ledge) dotY = ledge.y;
        }
        // Swept floor test: a surface only catches a dot that was above it.
        const landing = floorUnder(dotX, prevY);
        if (dotVY > 0 && landing && dotY >= landing.y) {
            dotY = landing.y;
            dotVY = -dotVY * restitution;
            if (Math.abs(dotVY) < sleepSpeed) dotVY = 0;  // sleep threshold ends micro-bounces
        }
        // Walking off the end of a ledge: start falling instead of hanging in the air.
        if (driven && dotVY === 0 && !standingOn(dotX, dotY)) {
            const below = floorUnder(dotX, dotY);
            if (below) dotY = Math.min(dotY + gravity * dt * dt, below.y);
        }
    };
    const animateDot = (time) => {
        // Anchored platforms track their elements once per frame, before the
        // substeps read them.
        refreshAnchors();
        if (dotLastTime === undefined) dotLastTime = time;
        const frame = Math.min((time - dotLastTime) / 1000, 0.05);
        dotLastTime = time;
        if (!dotDragging) {
            dotAccumulator += frame;
            while (dotAccumulator >= physicsStep) {
                stepDot(physicsStep);
                stepDebris(physicsStep);
                dotAccumulator -= physicsStep;
            }
        } else {
            dotAccumulator = 0;
        }
        placeDot();
        // Settled means "standing still on a surface" — a driven walk keeps the creature
        // alive, so walking must not read as a wake-up and collapse the figure.
        const asleep = !dotDragging && dotVY === 0 && (driven ? contactNow : dotVX === 0);
        if (asleep !== dotAsleep) {
            dotAsleep = asleep;
            if (asleep) userDrop = false;
            statusDot.classList.toggle('asleep', asleep);
            for (const listener of sleepListeners) {
                try {
                    listener(asleep);
                } catch (e) {
                    void e;
                }
            }
        }
        for (const listener of stepListeners) {
            try {
                listener(frame);
            } catch (e) {
                void e;
            }
        }
        requestAnimationFrame(animateDot);
    };
    const startDot = () => {
        const rect = dotSlot.getBoundingClientRect();
        dotX = rect.left + rect.width / 2;
        dotY = rect.top + rect.height / 2;
        dotVX = rollVector;           // a small random shove, as if rolled off a ledge
        dotVY = 0;
        statusDot.remove();
        document.body.appendChild(statusDot);
        placeDot();
        requestAnimationFrame(animateDot);
    };
    statusDot.addEventListener('pointerdown', (event) => {
        if (reduceMotion.matches) return;
        event.preventDefault();
        dotDragging = true;
        dotSelfRoll = false;          // from here on the dot only goes where it is thrown
        dotPointerX = event.clientX;
        dotPointerY = event.clientY;
        dotDragTime = performance.now();
        dotVX = 0;
        dotVY = 0;
        statusDot.classList.add('dragging');
        statusDot.setPointerCapture(event.pointerId);
    });
    statusDot.addEventListener('pointermove', (event) => {
        if (!dotDragging) return;
        const now = performance.now();
        const dt = Math.max((now - dotDragTime) / 1000, 0.008);
        const dx = event.clientX - dotPointerX;
        const dy = event.clientY - dotPointerY;
        dotVX = dx / dt;
        dotVY = dy / dt;
        // The dot can't leave the box it bounces in: clamp the drag to the
        // same world rect the integrator enforces.
        const world = dotWorld();
        dotX = Math.max(world.left, Math.min(world.right, dotX + dx));
        dotY = Math.max(world.top, Math.min(world.ground, dotY + dy));
        dotPointerX = event.clientX;
        dotPointerY = event.clientY;
        dotDragTime = now;
    });
    statusDot.addEventListener('pointerup', (event) => {
        dotDragging = false;
        userDrop = true;
        // Released: keep the throw velocity, clamped so a fast flick stays on-screen.
        const throwLimit = 12 * pixelsPerMetre;
        dotVX = Math.max(-throwLimit, Math.min(throwLimit, dotVX));
        dotVY = Math.max(-throwLimit, Math.min(throwLimit, dotVY));
        statusDot.classList.remove('dragging');
        statusDot.releasePointerCapture(event.pointerId);
    });
    const start = () => {
        if (!reduceMotion.matches) setTimeout(startDot, 600);
    };
    // A driven walk: the creature sets its own speed while it is on a surface.
    const drive = (vx) => {
        driven = true;
        dotVX = vx;
    };
    const release = () => {
        driven = false;
    };
    // A hop is a real impulse: control goes straight back to the integrator.
    const hop = (vy, vx = dotVX) => {
        driven = false;
        dotVY = -Math.abs(vy);
        dotVX = vx;
    };
    // A scripted move, used only by the creature's climbs: one smooth step onto
    // the next rung, landed exactly. Physics keeps owning the dot afterwards, so
    // if the rung it is aiming at were ever missing it simply falls.
    let stepFrom = null;
    let stepGoal = null;
    let stepStarted = 0;
    let stepDuration = 0;
    const stepTo = (x, y, ms = 500) => {
        const finite = Number.isFinite(x) && Number.isFinite(y);
        if (!finite) return false;
        stepFrom = {x: dotX, y: dotY};
        stepGoal = {x, y};
        stepDuration = Math.max(1, Number.isFinite(ms) ? ms : 500);
        stepStarted = performance.now();
        driven = false;
        dotVX = 0;
        dotVY = 0;
        return true;
    };
    const clearStep = () => {
        stepFrom = null;
        stepGoal = null;
    };
    // Chopped-off page bits fall with the same constants and the same floors.
    const spawnDebris = (el, x, y, vx, vy, spin = null) => {
        el.style.position = 'fixed';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        const rect = typeof el?.getBoundingClientRect === 'function'
            ? el.getBoundingClientRect()
            : null;
        const width = rect ? rect.width : 0;
        const height = rect ? rect.height : 0;
        debris.push({
            el,
            x,
            y,
            vx,
            vy,
            rot: 0,
            spin: Number.isFinite(spin) ? spin : (Math.random() - 0.5) * 600,
            resting: false,
            width,
            height
        });
    };
    // Boot a piece that has already settled: it stops resting, takes the given
    // velocity, and with `escape` it ignores the walls and floors entirely so it
    // can leave the page instead of bouncing around inside the card. It is
    // dropped from the simulation once it is clear of the viewport.
    const kickDebris = (el, vx, vy, spin = null, escape = false) => {
        const bit = debris.find((entry) => entry.el === el);
        if (!bit) return false;
        bit.resting = false;
        bit.vx = vx;
        bit.vy = vy;
        if (Number.isFinite(spin)) bit.spin = spin;
        bit.escape = escape;
        return true;
    };
    const clearDebris = () => {
        debris.length = 0;
    };
    const stepDebris = (dt) => {
        if (!debris.length) return;
        const world = dotWorld();
        for (let i = debris.length - 1; i >= 0; i -= 1) {
            const bit = debris[i];
            if (bit.resting) continue;
            bit.vy += gravity * dt;
            bit.vx -= bit.vx * airDrag * dt;
            const prevY = bit.y;
            bit.x += bit.vx * dt;
            bit.y += bit.vy * dt;
            bit.rot += bit.spin * dt;
            const w = Number.isFinite(bit.width) ? bit.width : 0;
            const h = Number.isFinite(bit.height) ? bit.height : 0;

            // Kicked clear of the page: no walls, no floors. Once it is fully
            // outside the viewport it is gone for good.
            if (bit.escape) {
                if (bit.x + w < -40 || bit.x > window.innerWidth + 40
                    || bit.y + h < -40 || bit.y > window.innerHeight + 40) {
                    bit.el.remove();
                    debris.splice(i, 1);
                    continue;
                }
                bit.el.style.left = `${bit.x}px`;
                bit.el.style.top = `${bit.y}px`;
                bit.el.style.transform = `rotate(${bit.rot}deg)`;
                continue;
            }

            const minX = Math.min(world.left, world.right - w);
            const maxX = Math.max(world.left, world.right - w);
            if (bit.x < minX || bit.x > maxX) {
                bit.x = Math.max(minX, Math.min(maxX, bit.x));
                bit.vx *= -wallRestitution;
            }

            // A falling bit lands on the footer rule when any part of it overlaps
            // the rule's span and its bottom edge was above the rule last step,
            // so wide glyphs can't slip through at their edges.
            const prevBottom = prevY + h;
            const overlapsLine = !world.lineGone && bit.x + w > world.lineLeft && bit.x < world.lineRight;
            const surface = overlapsLine && prevBottom <= world.lineY + dotRadius + 0.5
                ? world.lineY
                : world.ground;
            // Rest the bottom edge exactly on the surface instead of floating
            // one dot-radius above it.
            const floor = Math.max(world.top, surface + dotRadius - h);
            if (bit.vy > 0 && bit.y >= floor) {
                bit.y = floor;
                bit.vy = -bit.vy * restitution;
                bit.spin *= 0.5;
                if (Math.abs(bit.vy) < sleepSpeed) {
                    bit.vy = 0;
                    bit.vx -= bit.vx * rollResistance * dt;
                    if (Math.abs(bit.vx) < sleepCreep) {
                        bit.vx = 0;
                        bit.resting = true;
                    }
                }
            }
            if (bit.y < world.top) {
                bit.y = world.top;
                bit.vy = Math.abs(bit.vy) * restitution;
            }
            bit.el.style.left = `${bit.x}px`;
            bit.el.style.top = `${bit.y}px`;
            bit.el.style.transform = `rotate(${bit.rot}deg)`;
        }
    };
    return {
        el: statusDot,
        radius: dotRadius,
        start,
        onSleepChange,
        onStep,
        isAsleep: () => dotAsleep,
        isDragging: () => dotDragging,
        isGrounded: () => contactNow,
        pos: () => ({x: dotX, y: dotY}),
        velocity: () => ({vx: dotVX, vy: dotVY}),
        // falls must not read as drops, so this clears on read.
        consumeDrop: () => {
            const dropped = userDrop;
            userDrop = false;
            return dropped;
        },
        surface: () => surfaceNow,
        world: dotWorld,
        surfacesAt,
        surfaceSpan: () => {
            const s = standingOn(dotX, dotY);
            return s ? {left: s.left, right: s.right, y: s.y, kind: s.kind} : null;
        },
        addPlatform,
        removePlatform,
        anchorPlatform,
        dropLine,
        drive,
        release,
        hop,
        stepTo,
        clearStep,
        spawnDebris,
        kickDebris,
        clearDebris
    };
}
