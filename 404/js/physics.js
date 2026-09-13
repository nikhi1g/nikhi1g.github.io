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
            lineRight: footer.right
        };
    };
    // Every walkable surface, in one list: the footer rule, the card floor, and any
    // platform the creature has built. Each is {y, left, right, kind}.
    const platforms = [];
    let platformSeq = 0;
    const addPlatform = (left, right, y) => {
        const id = ++platformSeq;
        platforms.push({id, left, right, y: y - dotRadius, kind: 'platform'});
        return id;
    };
    const removePlatform = (id) => {
        const i = platforms.findIndex((p) => p.id === id);
        if (i >= 0) platforms.splice(i, 1);
    };
    const clearPlatforms = () => {
        platforms.length = 0;
    };
    const surfacesAt = (x) => {
        const world = dotWorld();
        const list = [{y: world.ground, left: world.left, right: world.right, kind: 'ground'},
            {y: world.lineY, left: world.lineLeft, right: world.lineRight, kind: 'line'}, ...platforms];
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
        if (dotY < world.top) {
            dotY = world.top;
            dotVY = Math.abs(dotVY) * restitution;
        }
        // Swept floor test: a surface only catches a dot that was above it.
        const landing = floorUnder(dotX, prevY);
        if (dotVY > 0 && landing && dotY >= landing.y) {
            dotY = landing.y;
            dotVY = -dotVY * restitution;
            if (Math.abs(dotVY) < sleepSpeed) dotVY = 0;  // sleep threshold ends micro-bounces
        }
    };
    const animateDot = (time) => {
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
            statusDot.classList.toggle('asleep', asleep);
            for (const listener of sleepListeners) listener(asleep);
        }
        for (const listener of stepListeners) listener(frame);
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
        dotX += dx;
        dotY += dy;
        dotPointerX = event.clientX;
        dotPointerY = event.clientY;
        dotDragTime = now;
    });
    statusDot.addEventListener('pointerup', (event) => {
        dotDragging = false;
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
    // Chopped-off page bits fall with the same constants and the same floors.
    const spawnDebris = (el, x, y, vx, vy) => {
        el.style.position = 'fixed';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        debris.push({el, x, y, vx, vy, rot: 0, spin: (Math.random() - 0.5) * 600, resting: false});
    };
    const clearDebris = () => {
        debris.length = 0;
    };
    const stepDebris = (dt) => {
        if (!debris.length) return;
        const world = dotWorld();
        for (const bit of debris) {
            if (bit.resting) continue;
            bit.vy += gravity * dt;
            bit.vx -= bit.vx * airDrag * dt;
            const prevY = bit.y;
            bit.x += bit.vx * dt;
            bit.y += bit.vy * dt;
            bit.rot += bit.spin * dt;
            if (bit.x < world.left || bit.x > world.right) {
                bit.x = Math.max(world.left, Math.min(world.right, bit.x));
                bit.vx *= -wallRestitution;
            }
            const overLine = bit.x >= world.lineLeft && bit.x <= world.lineRight;
            const floor = overLine && prevY <= world.lineY + 0.5 ? world.lineY : world.ground;
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
        surface: () => surfaceNow,
        pos: () => ({x: dotX, y: dotY}),
        velocity: () => ({vx: dotVX, vy: dotVY}),
        world: dotWorld,
        surfacesAt,
        surfaceSpan: () => {
            const s = standingOn(dotX, dotY);
            return s ? {left: s.left, right: s.right, y: s.y, kind: s.kind} : null;
        },
        addPlatform,
        removePlatform,
        clearPlatforms,
        drive,
        release,
        hop,
        spawnDebris,
        clearDebris
    };
}
