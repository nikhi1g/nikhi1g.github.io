const STEP_RISE = 14;
const STEP_RUN = 22;
const STEP_WIDTH = 30;
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
    };

    const planTo = (targetX, targetY) => {
        // A new route cannot leave its old platforms registered. Remove materialised
        // steps first, then replace the unbuilt route.
        clear();

        const world = dot.world();
        const worldLeft = finiteOr(world.left, 0);
        const worldRight = finiteOr(world.right, worldLeft);
        const worldTop = finiteOr(world.top, 0);
        const lowerX = Math.min(worldLeft, worldRight) + 4;
        const upperX = Math.max(worldLeft, worldRight) - 4;
        const xMin = Math.min(lowerX, upperX);
        const xMax = Math.max(lowerX, upperX);
        const availableWidth = Math.max(0, xMax - xMin);
        const run = Math.min(STEP_WIDTH, availableWidth);

        const position = dot.pos();
        const rawStartX = finiteOr(position && position.x, (worldLeft + worldRight) / 2);
        const startX = Math.max(xMin, Math.min(xMax, rawStartX));
        const rawTargetX = finiteOr(targetX, startX);
        const destinationX = Math.max(xMin, Math.min(xMax, rawTargetX));
        const direction = destinationX < startX ? -1 : 1;

        const span = typeof dot.surfaceSpan === 'function' ? dot.surfaceSpan() : null;
        const radius = Math.max(0, finiteOr(dot.radius, 0));
        const fallbackContactY = finiteOr(position && position.y, finiteOr(world.ground, worldTop));
        const contactY = finiteOr(span && span.y, fallbackContactY);
        // surfaceSpan().y is the dot's contact point. addPlatform() receives the
        // visible platform top, which is one radius above that contact point.
        const standingTop = contactY + radius;
        const destinationY = finiteOr(targetY, standingTop);
        const verticalGap = Math.max(0, standingTop - (destinationY + WORK_REACH));
        const verticalSteps = Math.ceil(verticalGap / STEP_RISE);
        const horizontalSteps = Math.ceil(Math.abs(destinationX - startX) / STEP_RUN);
        const stepCount = Math.max(1, verticalSteps, horizontalSteps);
        const horizontalDistance = Math.abs(destinationX - startX);
        const edgeTravel = horizontalDistance < run
            ? horizontalDistance
            : horizontalDistance - run;
        const horizontalShift = stepCount > 1
            ? Math.min(STEP_RUN, edgeTravel / (stepCount - 1))
            : 0;

        const riseSteps = Math.max(1, verticalSteps);
        for (let index = 0; index < stepCount; index += 1) {
            const horizontalOffset = index * horizontalShift;
            const rawLeft = direction > 0
                ? startX + horizontalOffset
                : startX - run - horizontalOffset;
            const left = run >= availableWidth
                ? xMin
                : Math.max(xMin, Math.min(xMax - run, rawLeft));
            const right = left + run;
            // Horizontal runs may outnumber the vertical rise. Hold those extra
            // steps at the first reachable level instead of climbing past targetY.
            const rise = Math.min(index + 1, riseSteps) * STEP_RISE;
            const y = Math.max(worldTop, standingTop - rise);
            plan.push({left, right, y});
        }

        return plan.length;
    };

    const buildNext = () => {
        if (built.length >= plan.length) return false;

        const rect = plan[built.length];
        const element = document.createElement('div');
        element.className = 'stair';
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.y}px`;
        element.style.width = `${Math.max(0, rect.right - rect.left)}px`;
        document.body.appendChild(element);

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

    return {
        planTo,
        buildNext,
        isComplete,
        teardownNext,
        hasAny,
        clear
    };
}
