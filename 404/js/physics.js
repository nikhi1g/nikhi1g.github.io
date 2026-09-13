export function createDot() {
    const mainEl = document.querySelector('main');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Real physics for the status dot: MKS units scaled to pixels, à la Box2D's
    // pixels-per-meter convention, with a coefficient of restitution and a sleep
    // threshold as in the standard canvas bouncing-ball implementations.
    const statusDot = document.querySelector('.dot');
    const dotSlot = document.querySelector('.dot-slot');
    const footerEl = document.querySelector('footer');
    const dotRadius = 8;
    const pixelsPerMetre = 100;                        // the 16px dot is a 16cm ball
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
    const stepDot = (dt) => {
        const world = dotWorld();
        const overLine = dotX >= world.lineLeft && dotX <= world.lineRight;
        const onLine = overLine && Math.abs(dotY - world.lineY) < 0.5;
        const onGround = Math.abs(dotY - world.ground) < 0.5;
        const contact = (onLine || onGround) && dotVY === 0;
        if (contact) {
            if (onLine && dotSelfRoll) {
                // Launch roll only: resistance scales with the shove, so any shove bleeds
                // down to the same gentle creep before it reaches the end of the rule.
                dotVX += (rollPush - rollFriction * dotVX) * dt;
            } else {
                dotVX -= dotVX * rollResistance * dt;   // plain rolling resistance
                if (Math.abs(dotVX) < sleepCreep) dotVX = 0;
            }
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
        // Swept floor test: the rule only catches a dot that was above it.
        const stillOverLine = dotX >= world.lineLeft && dotX <= world.lineRight;
        const floor = stillOverLine && prevY <= world.lineY + 0.5 ? world.lineY : world.ground;
        if (dotVY > 0 && dotY >= floor) {
            dotY = floor;
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
                dotAccumulator -= physicsStep;
            }
        } else {
            dotAccumulator = 0;
        }
        placeDot();
        const asleep = !dotDragging && dotVX === 0 && dotVY === 0;
        if (asleep !== dotAsleep) {
            dotAsleep = asleep;
            statusDot.classList.toggle('asleep', asleep);
            for (const listener of sleepListeners) listener(asleep);
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
    return { el: statusDot, start, onSleepChange, isAsleep: () => dotAsleep, isDragging: () => dotDragging };
}
