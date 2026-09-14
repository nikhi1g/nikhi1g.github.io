const WALK_SPEED = 40;
const PEER_DURATION = 600;
const SWING_DURATION = 420;
const REDUCED_SWING_DURATION = 80;
const STAIR_CLIMB_SPEED = 26;
const LADDER_CLIMB_SPEED = 10;
const MAX_CLIMB_STEP = 18;

export function createGait(dot) {
    const element = dot.el;
    let currentFacing = 1;
    let walking = false;
    let climbing = false;
    let hopping = false;
    let hopStepSeen = false;
    let hopAirborne = false;
    let swingActive = false;
    const swingQueue = [];

    const prefersReducedMotion = () => (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    const normalizeDirection = (dir) => (dir < 0 ? -1 : 1);

    const setFacing = (dir) => {
        currentFacing = normalizeDirection(dir);
        element.classList.toggle('face-left', currentFacing === -1);
    };

    const facing = () => currentFacing;

    const idle = (on) => {
        element.classList.toggle('idle-bob', Boolean(on));
    };

    const stop = () => {
        const wasWalking = walking;
        const wasClimbing = climbing;
        walking = false;
        climbing = false;
        element.classList.remove('walking');
        element.classList.remove('climbing');
        element.classList.remove('laddering');
        if (wasWalking || wasClimbing) dot.drive(0);
        dot.release();
    };

    const walk = (dir) => {
        setFacing(dir);
        climbing = false;
        walking = true;
        element.classList.add('walking');
        element.classList.remove('idle-bob');
        element.classList.remove('climbing');
        element.classList.remove('laddering');
        dot.drive(currentFacing * WALK_SPEED);
    };
    const climb = (dir, mode) => {
        setFacing(dir);
        const ladder = mode === 'ladder';
        walking = false;
        climbing = true;
        element.classList.remove('walking');
        element.classList.remove('idle-bob');
        element.classList.toggle('climbing', !ladder);
        element.classList.toggle('laddering', ladder);
        dot.drive(currentFacing * (ladder ? LADDER_CLIMB_SPEED : STAIR_CLIMB_SPEED));
    };

    const stopClimb = () => {
        const wasClimbing = climbing;
        climbing = false;
        element.classList.remove('climbing');
        element.classList.remove('laddering');
        if (wasClimbing) dot.drive(0);
        dot.release();
    };

    const isClimbing = () => climbing;

    const lean = (amount) => {
        const numericAmount = Number(amount);
        const clampedAmount = Number.isFinite(numericAmount)
            ? Math.max(-1, Math.min(1, numericAmount))
            : 0;
        element.style.setProperty('--lean', clampedAmount);
        element.classList.toggle('leaning', clampedAmount !== 0);
    };

    const finishHop = () => {
        hopping = false;
        element.classList.remove('hopping');
    };

    const hopDown = (dir) => {
        element.classList.remove('hopping');
        hopping = true;
        hopStepSeen = false;
        hopAirborne = false;
        if (!prefersReducedMotion()) element.classList.add('hopping');
        dot.hop(260, normalizeDirection(dir) * 55);
    };

    const setTool = (kind) => {
        const hammer = kind === 'hammer';
        element.classList.toggle('holding-axe', !hammer);
        element.classList.toggle('holding-hammer', hammer);
    };

    // Stows whatever tool is in hand. Without this the last swing's class
    // survives the end of the show and the creature re-appears holding it.
    const putAway = () => {
        element.classList.remove('holding-axe', 'holding-hammer', 'swinging');
    };

    const startNextSwing = () => {
        if (swingActive || swingQueue.length === 0) return;
        swingActive = true;
        const {kind, resolve} = swingQueue.shift();
        setTool(kind);

        const reduced = prefersReducedMotion();
        element.classList.remove('swinging');
        if (!reduced) {
            void element.offsetWidth;
            element.classList.add('swinging');
        }

        const duration = reduced ? REDUCED_SWING_DURATION : SWING_DURATION;
        setTimeout(() => {
            element.classList.remove('swinging');
            swingActive = false;
            resolve();
            startNextSwing();
        }, duration);
    };

    const peer = () => {
        if (prefersReducedMotion()) {
            element.classList.remove('peering');
            return Promise.resolve();
        }
        element.classList.add('peering');
        return new Promise((resolve) => {
            setTimeout(() => {
                element.classList.remove('peering');
                resolve();
            }, PEER_DURATION);
        });
    };

    const swing = (kind) => new Promise((resolve) => {
        swingQueue.push({kind: kind === 'hammer' ? 'hammer' : 'axe', resolve});
        startNextSwing();
    });

    dot.onStep((frameSeconds = 0) => {
        if (walking || climbing) {
            const world = dot.world();
            const surface = dot.surface();
            const climbActive = climbing;
            const currentSpan = climbActive && typeof dot.surfaceSpan === 'function'
                ? dot.surfaceSpan()
                : null;
            const edge = climbActive && currentSpan
                ? (currentFacing > 0 ? currentSpan.right : currentSpan.left)
                : (currentFacing > 0
                    ? (surface === 'line' ? world.lineRight : world.right)
                    : (surface === 'line' ? world.lineLeft : world.left));
            const position = dot.pos();
            const velocity = dot.velocity();
            const seconds = Number.isFinite(frameSeconds) ? Math.max(0, frameSeconds) : 0;
            const nextX = position.x + velocity.vx * seconds;
            const passedEdge = currentFacing > 0 ? nextX >= edge : nextX <= edge;
            let hasNextClimbSurface = false;
            if (climbActive
                && passedEdge
                && currentSpan
                && typeof dot.surfacesAt === 'function') {
                const currentY = Number(currentSpan.y);
                const surfaces = dot.surfacesAt(nextX);
                hasNextClimbSurface = Number.isFinite(currentY)
                    && Array.isArray(surfaces)
                    && surfaces.some((candidate) => {
                        const candidateY = candidate ? Number(candidate.y) : NaN;
                        return Number.isFinite(candidateY)
                            && candidateY < currentY
                            && currentY - candidateY <= MAX_CLIMB_STEP;
                    });
            }
            if (passedEdge && !hasNextClimbSurface) stop();
        }

        if (hopping) {
            const grounded = dot.isGrounded();
            if (!hopStepSeen) {
                hopStepSeen = true;
                if (!grounded) hopAirborne = true;
                else finishHop();
            } else if (!grounded) {
                hopAirborne = true;
            } else if (hopAirborne) {
                finishHop();
            }
        }
    });

    return {
        setFacing,
        facing,
        idle,
        walk,
        stop,
        isWalking: () => walking,
        lean,
        peer,
        hopDown,
        swing,
        putAway,
        climb,
        stopClimb,
        isClimbing
    };
}
