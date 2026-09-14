const STEP_RISE = 14;
const STEP_RUN = 22;
const STEP_WIDTH = 30;
const MIN_OVERLAP = 6;
const LADDER_RUN_THRESHOLD = 8;
const WORK_REACH = 30;
const FADE_MS = 200;
const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

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
    // Remembered so the renderer knows whether this route is stepped or vertical.
    let planMode = 'stairs';
    const built = [];
    const elements = new Set();
    const pendingRemovals = new Map();

    const prefersReducedMotion = () => (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia(REDUCE_MOTION_QUERY).matches
    );

    const cancelRemoval = (element) => {
        const timer = pendingRemovals.get(element);
        if (timer !== undefined) {
            clearTimeout(timer);
            pendingRemovals.delete(element);
        }
    };

    const discardElement = (element) => {
        cancelRemoval(element);
        elements.delete(element);
        removeElement(element);
    };

    const scheduleRemoval = (element) => {
        if (prefersReducedMotion()) {
            discardElement(element);
            return;
        }
        const timer = setTimeout(() => {
            pendingRemovals.delete(element);
            elements.delete(element);
            removeElement(element);
        }, FADE_MS);
        pendingRemovals.set(element, timer);
    };

    const clear = () => {
        for (const timer of pendingRemovals.values()) clearTimeout(timer);
        pendingRemovals.clear();

        for (const record of built) dot.removePlatform(record.id);
        for (const element of elements) removeElement(element);

        built.length = 0;
        elements.clear();
        plan = [];
        planMode = 'stairs';
    };

    // `keep` continues an existing staircase instead of replacing it: the new
    // treads append above the ones already built, rooted at whatever the
    // creature is standing on. That lets it travel in legs without ever losing
    // the tread under its feet, which would drop it out of its climb pose.
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
        const rawTargetX = finiteOr(targetX, startX);
        const destinationX = Math.max(xMin, Math.min(xMax, rawTargetX));
        const direction = destinationX < startX ? -1 : 1;

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
        const verticalSteps = totalRise > 0
            ? Math.ceil(totalRise / STEP_RISE)
            : 0;

        // Put one edge of the first tread at the creature's feet. The remaining
        // treads advance by at most the fixed pitch, while their 30px span leaves
        // at least 8px of overlap (or more when clamping at a card edge).
        const firstLeft = clampLeft(
            direction > 0 ? startX : startX - width
        );
        const firstRight = firstLeft + width;
        const horizontalDistance = direction > 0
            ? Math.max(0, destinationX - firstRight)
            : Math.max(0, firstLeft - destinationX);
        const horizontalSteps = 1 + Math.ceil(horizontalDistance / STEP_RUN);

        const stepCount = Math.max(1, verticalSteps, horizontalSteps);
        let previous = null;
        for (let index = 0; index < stepCount; index += 1) {
            const horizontalIndex = Math.min(index, horizontalSteps - 1);
            const horizontalAdvance = Math.min(
                horizontalDistance,
                horizontalIndex * STEP_RUN
            );
            const rawLeft = firstLeft + direction * horizontalAdvance;
            const left = clampLeft(rawLeft);
            const rise = Math.min(totalRise, (index + 1) * STEP_RISE);
            const step = {
                left,
                right: left + width,
                y: Math.max(worldTop, baseTop - rise)
            };

            if (previous) {
                const riseBetween = previous.y - step.y;
                const overlap = Math.min(previous.right, step.right)
                    - Math.max(previous.left, step.left);
                if (riseBetween < -0.001
                    || riseBetween > STEP_RISE + 0.001
                    || overlap < MIN_OVERLAP - 0.001) {
                    throw new Error('Untraversable stair plan');
                }
            }
            plan.push(step);
            previous = step;
        }

        planMode = mode();
        return plan.length;
    };
    const buildNext = () => {
        if (built.length >= plan.length) return false;

        const rect = plan[built.length];
        const ladder = planMode === 'ladder';
        const element = document.createElement('div');
        // In ladder mode the same geometry is a rung strung between two rails.
        element.className = ladder ? 'stair rung' : 'stair';
        // Positioned inline as well as in CSS: `body` is a flex container, so a
        // tread that ever lacked `position: fixed` (a stylesheet that failed to
        // load, a slow first paint) would become a flex item and steal width
        // from the card — which moves the physics bounds with it.
        element.style.position = 'fixed';
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.y}px`;
        element.style.width = `${Math.max(0, rect.right - rect.left)}px`;
        document.body.appendChild(element);

        // A ladder needs its rails: two uprights spanning the whole route,
        // raised with the first rung.
        if (ladder && built.length === 0) {
            const last = plan[plan.length - 1];
            const top = Math.min(rect.y, last.y);
            const height = Math.abs(rect.y - last.y) + 6;
            for (const x of [rect.left + 1, rect.right - 4]) {
                const rail = document.createElement('div');
                rail.className = 'ladder-rail';
                rail.style.position = 'fixed';
                rail.style.left = `${x}px`;
                rail.style.top = `${top}px`;
                rail.style.height = `${height}px`;
                document.body.appendChild(rail);
                elements.add(rail);
            }
        }

        // A step is not a step without its riser: the vertical face connecting
        // this tread back down to the one below it.
        if (!ladder && built.length > 0) {
            const previous = plan[built.length - 1];
            const midX = (Math.max(previous.left, rect.left) + Math.min(previous.right, rect.right)) / 2;
            const height = Math.abs(previous.y - rect.y);
            if (height > 0.5) {
                const riser = document.createElement('div');
                riser.className = 'stair-riser';
                riser.style.position = 'fixed';
                riser.style.left = `${midX}px`;
                riser.style.top = `${Math.min(previous.y, rect.y)}px`;
                riser.style.height = `${height}px`;
                document.body.appendChild(riser);
                elements.add(riser);
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

    const teardownNext = () => {
        if (!built.length) return false;

        const record = built.pop();
        dot.removePlatform(record.id);
        record.element.classList.add('going');
        scheduleRemoval(record.element);
        return true;
    };

    const hasAny = () => built.length > 0;

    const mode = () => {
        if (plan.length < 2) return 'stairs';

        let totalAdvance = 0;
        for (let index = 1; index < plan.length; index += 1) {
            totalAdvance += Math.abs(plan[index].left - plan[index - 1].left);
        }
        const meanAdvance = totalAdvance / (plan.length - 1);
        return meanAdvance < LADDER_RUN_THRESHOLD ? 'ladder' : 'stairs';
    };

    return {
        planTo,
        buildNext,
        isComplete,
        teardownNext,
        hasAny,
        clear,
        mode,
        activeMode: () => planMode,
        // The treads actually built, in climb order, as absolute surface spans.
        // The climb walks this list one rung at a time.
        route: () => built
            .map((record, index) => plan[index])
            .filter(Boolean)
            .map((step) => ({left: step.left, right: step.right, y: step.y}))
    };
}
