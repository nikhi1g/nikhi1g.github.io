const STEP_RISE = 14;
const STEP_WIDTH = 30;
const WORK_REACH = 30;

const finiteOr = (value, fallback) => (
    Number.isFinite(Number(value)) ? Number(value) : fallback
);

const removeElement = (element) => {
    if (!element) return;
    if (typeof element.remove === 'function') {
        element.remove();
    } else if (element.parentNode && typeof element.parentNode.removeChild === 'function') {
        element.parentNode.removeChild(element);
    }
};

export function createStairs(dot) {
    let plan = [];
    // Each planTo call adds one LEG. A leg carries its own start/end indices into
    // `plan`, because a continued route (options.keep) never clears the previous
    // legs — and each leg grows its own rails, so the uprights always line up
    // with the rungs they were raised with.
    let legs = [];
    const built = [];
    const elements = new Set();
    // The uprights of the ladder currently being raised, if any. Rails span
    // only the rungs built so far and grow with each new rung.
    let railState = null;

    const clear = () => {
        for (const record of built) dot.removePlatform(record.id);
        for (const element of elements) removeElement(element);

        built.length = 0;
        elements.clear();
        plan = [];
        legs = [];
        railState = null;
    };

    // `keep` continues an existing ladder instead of replacing it: the new rungs
    // append above the ones already built, rooted at whatever the creature is
    // standing on. That lets it travel in legs without ever losing the rung
    // under its feet, which would drop it out of its climb pose.
    const planTo = (targetX, targetY, options = {}) => {
        // Capture the current support before clearing an older route. This keeps a
        // replanned route rooted at the surface the creature is actually standing on.
        const position = typeof dot.pos === 'function' ? dot.pos() : null;
        const standing = typeof dot.surfaceSpan === 'function' ? dot.surfaceSpan() : null;
        const world = typeof dot.world === 'function' ? (dot.world() || {}) : {};
        if (!(options.keep === true && built.length > 0)) clear();

        const rawWorldLeft = finiteOr(world.left, 0);
        const rawWorldRight = finiteOr(world.right, rawWorldLeft);
        const worldLeft = Math.min(rawWorldLeft, rawWorldRight);
        const worldRight = Math.max(rawWorldLeft, rawWorldRight);
        const worldTop = finiteOr(world.top, 0);
        const innerLeft = worldLeft + 4;
        const innerRight = worldRight - 4;
        const xMin = Math.min(innerLeft, innerRight);
        const xMax = Math.max(innerLeft, innerRight);
        const availableWidth = Math.max(0, xMax - xMin);
        const width = Math.min(STEP_WIDTH, availableWidth);
        const maxLeft = xMax - width;
        const clampLeft = (left) => Math.max(xMin, Math.min(maxLeft, left));

        const rawStartX = finiteOr(
            position && position.x,
            (worldLeft + worldRight) / 2
        );
        const startX = Math.max(xMin, Math.min(xMax, rawStartX));
        // The shaft rises where the creature stands. Horizontal travel happens
        // on foot before the ladder is planned, never on it.
        const left = clampLeft(startX - width / 2);

        const radius = Math.max(0, finiteOr(dot.radius, 0));
        const fallbackContactY = finiteOr(
            position && position.y,
            finiteOr(world.ground, worldTop)
        );
        const contactY = finiteOr(standing && standing.y, fallbackContactY);
        const baseTop = Math.max(worldTop, contactY + radius);
        const desiredTop = Math.max(
            worldTop,
            finiteOr(targetY, baseTop) + WORK_REACH
        );
        const neededRise = Math.max(0, baseTop - desiredTop);
        const availableRise = Math.max(0, baseTop - worldTop);
        const totalRise = Math.min(neededRise, availableRise);
        const stepCount = totalRise > 0
            ? Math.max(1, Math.ceil(totalRise / STEP_RISE))
            : 1;

        const legStart = plan.length;
        let previous = null;
        for (let index = 0; index < stepCount; index += 1) {
            const rise = Math.min(totalRise, (index + 1) * STEP_RISE);
            const step = {
                left,
                right: left + width,
                y: Math.max(worldTop, baseTop - rise)
            };

            if (previous) {
                const riseBetween = previous.y - step.y;
                if (riseBetween < -0.001 || riseBetween > STEP_RISE + 0.001) {
                    throw new Error('Untraversable ladder plan');
                }
            }
            plan.push(step);
            previous = step;
        }

        legs.push({start: legStart, end: plan.length});
        return plan.length;
    };
    const buildNext = () => {
        if (built.length >= plan.length) return false;

        const rect = plan[built.length];
        const leg = legFor(built.length);
        const element = document.createElement('div');
        // Every build is a ladder rung strung between two rails. There is no
        // staircase anymore: the creature walks to the shaft's x first, then
        // climbs straight up.
        element.className = 'stair rung';
        // Positioned inline as well as in CSS: `body` is a flex container, so a
        // tread that ever lacked `position: fixed` (a stylesheet that failed to
        // load, a slow first paint) would become a flex item and steal width
        // from the card — which moves the physics bounds with it.
        element.style.position = 'fixed';
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.y}px`;
        element.style.width = `${Math.max(0, rect.right - rect.left)}px`;
        document.body.appendChild(element);

        // The rails grow one rung at a time: the two uprights span only the
        // rungs built so far and extend upward with each new rung, so they are
        // never taller than the ladder itself.
        if (leg) {
            // A ladder's rungs all share one x, so the rails sit on that x.
            if (!railState || railState.leg !== leg) {
                const rails = [];
                for (const x of [rect.left + 1, rect.right - 4]) {
                    const rail = document.createElement('div');
                    rail.className = 'ladder-rail';
                    rail.style.position = 'fixed';
                    rail.style.left = `${x}px`;
                    document.body.appendChild(rail);
                    elements.add(rail);
                    rails.push(rail);
                }
                railState = {leg, top: rect.y, bottom: rect.y, rails};
            } else {
                railState.top = Math.min(railState.top, rect.y);
                railState.bottom = Math.max(railState.bottom, rect.y);
            }
            for (const rail of railState.rails) {
                rail.style.top = `${railState.top}px`;
                rail.style.height = `${railState.bottom - railState.top + 6}px`;
            }
        }


        // Reading layout before adding the final state makes the CSS transition run
        // for each individual hammer/build action instead of being skipped.
        void element.offsetWidth;
        element.classList.add('built');

        const id = dot.addPlatform(rect.left, rect.right, rect.y);
        built.push({id, element});
        elements.add(element);
        return true;
    };

    const isComplete = () => built.length === plan.length;

    // Break the ladder apart instead of fading it out: every rung and rail
    // stops being a platform, leaves this module's bookkeeping, and is handed
    // to the debris system to fall and clutter the floor. The pieces stay in
    // the DOM as `.stair` / `.ladder-rail`, which is exactly what the sweep and
    // vacuum passes collect.
    const demolish = () => {
        if (!built.length && !elements.size) return 0;

        for (const record of built) dot.removePlatform(record.id);

        let thrown = 0;
        for (const element of elements) {
            const box = element.getBoundingClientRect();
            if (!box || (box.width < 1 && box.height < 1)) {
                removeElement(element);
                continue;
            }
            // Knocked off its footing: a shove outward from where it stood,
            // a little lift, and a tumble on the way down.
            element.classList.remove('built');
            dot.spawnDebris(
                element,
                box.left,
                box.top,
                (Math.random() - 0.5) * 220,
                -60 - Math.random() * 120,
                (Math.random() - 0.5) * 700
            );
            thrown += 1;
        }

        built.length = 0;
        elements.clear();
        plan = [];
        legs = [];
        railState = null;
        return thrown;
    };

    const hasAny = () => built.length > 0;

    const legFor = (index) => legs.find((leg) => index >= leg.start && index < leg.end)
        || legs[legs.length - 1]
        || null;

    // The rung just built, as an absolute surface span. The climb steps onto
    // each rung as it is hammered in, so it needs this — not the whole route.
    const lastBuilt = () => {
        if (!built.length) return null;
        const step = plan[built.length - 1];
        return step ? {left: step.left, right: step.right, y: step.y} : null;
    };
    return {
        planTo,
        buildNext,
        lastBuilt,
        isComplete,
        demolish,
        hasAny,
        clear
    };
}
