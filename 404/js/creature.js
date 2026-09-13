export function createCreature({dot, gait, damage}) {
    const restSeconds = 6;
    const breakWindowMs = 20000;
    const arrivalDistance = 6;
    const fleeDistance = 90;
    const leanDistance = 180;
    const fleeCooldownMs = 2500;
    const fleeSeconds = 1.2;

    const complete = 'complete';
    const condition = 'condition';
    const timeout = 'timeout';
    const interrupted = 'interrupted';
    const flee = 'flee';
    const arrived = 'arrived';
    const ended = 'ended';
    const hopped = 'hopped';
    const skipped = 'skipped';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stepWaiters = new Set();
    const pendingCancellations = new Set();

    let started = false;
    let motionDisabled = reduceMotion.matches;
    let runId = 0;
    let active = false;
    let fleeRequested = false;
    let fleeing = false;
    let plannedHop = null;
    let mouseX = null;
    let mouseY = null;
    let lastFleeRoll = -Infinity;
    let leanAmount = 0;

    const isCurrent = (id) => id === runId && !motionDisabled;

    const clearWorkPose = () => {
        dot.el.classList.remove('peering', 'swinging', 'holding-axe', 'holding-hammer');
    };

    const stopPoses = () => {
        gait.stop();
        gait.idle(false);
        gait.lean(0);
        leanAmount = 0;
        dot.el.classList.remove(
            'walking',
            'idle-bob',
            'peering',
            'hopping',
            'leaning',
            'swinging',
            'holding-axe',
            'holding-hammer'
        );
    };

    const setLean = (amount) => {
        const next = Math.max(-1, Math.min(1, amount));
        if (Math.abs(next - leanAmount) < 0.02 && !(next === 0 && leanAmount !== 0)) return;
        leanAmount = next;
        gait.lean(next);
    };

    const cancelPending = (reason) => {
        for (const cancel of pendingCancellations) cancel(reason);
    };

    const waitForStep = (id, {predicate = null, seconds = null, canFlee = true} = {}) => {
        if (!isCurrent(id)) return Promise.resolve(interrupted);
        if (canFlee && fleeRequested) return Promise.resolve(flee);
        if (predicate && predicate()) return Promise.resolve(condition);
        if (seconds !== null && seconds <= 0) return Promise.resolve(timeout);

        return new Promise((resolve) => {
            let settled = false;
            let waiter;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                stepWaiters.delete(waiter);
                pendingCancellations.delete(finish);
                resolve(result);
            };
            waiter = {
                id,
                predicate,
                remaining: seconds,
                canFlee,
                finish
            };
            stepWaiters.add(waiter);
            pendingCancellations.add(finish);
        });
    };

    const waitForAction = (promise, id, canFlee = true) => {
        if (!isCurrent(id)) return Promise.resolve(interrupted);
        if (canFlee && fleeRequested) return Promise.resolve(flee);

        return new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                pendingCancellations.delete(finish);
                resolve(result);
            };
            pendingCancellations.add(finish);
            Promise.resolve(promise).then(
                () => {
                    if (!isCurrent(id)) finish(interrupted);
                    else if (canFlee && fleeRequested) finish(flee);
                    else finish(complete);
                },
                () => finish(interrupted)
            );
        });
    };

    const interruptRun = () => {
        const collapseSprout = plannedHop !== null;
        runId += 1;
        active = false;
        fleeRequested = false;
        fleeing = false;
        if (collapseSprout) dot.el.classList.remove('sprouted');
        plannedHop = null;
        cancelPending(interrupted);
        stopPoses();
    };

    const requestFlee = () => {
        if (!active || fleeing || fleeRequested || plannedHop) return;
        fleeRequested = true;
        gait.stop();
        gait.idle(false);
        gait.lean(0);
        leanAmount = 0;
        clearWorkPose();
        cancelPending(flee);
    };

    const updateCursorResponse = () => {
        if (!active || fleeing || fleeRequested || plannedHop || !dot.isGrounded()) {
            if (active && !fleeing && !fleeRequested && !plannedHop) setLean(0);
            return;
        }
        if (mouseX === null || mouseY === null) {
            setLean(0);
            return;
        }

        const position = dot.pos();
        const dx = mouseX - position.x;
        const dy = mouseY - position.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= fleeDistance) {
            setLean(0);
            const now = performance.now();
            if (now - lastFleeRoll >= fleeCooldownMs) {
                lastFleeRoll = now;
                if (Math.random() < 0.5) requestFlee();
            }
            return;
        }

        if (distance < leanDistance) {
            const strength = (leanDistance - distance) / (leanDistance - fleeDistance);
            setLean(-Math.sign(dx) * strength);
        } else {
            setLean(0);
        }
    };

    const advanceWaiters = (frameSeconds) => {
        for (const waiter of stepWaiters) {
            if (!isCurrent(waiter.id)) {
                waiter.finish(interrupted);
                continue;
            }
            if (waiter.canFlee && fleeRequested) {
                waiter.finish(flee);
                continue;
            }
            if (waiter.predicate && waiter.predicate()) {
                waiter.finish(condition);
                continue;
            }
            if (waiter.remaining !== null) {
                waiter.remaining -= Math.max(0, frameSeconds);
                if (waiter.remaining <= 0) waiter.finish(timeout);
            }
        }
    };

    const onStep = (frameSeconds) => {
        if (reduceMotion.matches) {
            if (!motionDisabled) {
                motionDisabled = true;
                interruptRun();
            }
            return;
        }
        if (plannedHop && dot.isDragging()) {
            interruptRun();
            return;
        }
        updateCursorResponse();
        advanceWaiters(frameSeconds);
    };

    const performHop = async (dir, id) => {
        if (!isCurrent(id)) return interrupted;
        plannedHop = {landed: false};
        let leftSurface = false;
        gait.lean(0);
        leanAmount = 0;
        gait.setFacing(dir);
        gait.hopDown(dir);

        const landing = await waitForStep(id, {
            canFlee: false,
            predicate: () => {
                if (!dot.isGrounded()) leftSurface = true;
                return leftSurface && plannedHop && plannedHop.landed && dot.isGrounded();
            }
        });
        if (!isCurrent(id) || landing === interrupted) return interrupted;

        const sprouted = await waitForStep(id, {
            canFlee: false,
            predicate: () => dot.isAsleep() && dot.el.classList.contains('sprouted')
        });
        if (!isCurrent(id) || sprouted === interrupted) return interrupted;
        plannedHop = null;
        return complete;
    };

    const fleeDirection = () => {
        const position = dot.pos();
        if (mouseX < position.x) return 1;
        if (mouseX > position.x) return -1;

        const world = dot.world();
        const onLine = dot.surface() === 'line';
        const left = onLine ? world.lineLeft : world.left;
        const right = onLine ? world.lineRight : world.right;
        return position.x - left > right - position.x ? -1 : 1;
    };

    const performFlee = async (id) => {
        if (!isCurrent(id) || !fleeRequested) return interrupted;
        fleeRequested = false;
        fleeing = true;
        clearWorkPose();
        gait.idle(false);
        gait.lean(0);
        leanAmount = 0;

        const dir = fleeDirection();
        gait.setFacing(dir);
        gait.walk(dir);
        const escape = await waitForStep(id, {
            canFlee: false,
            seconds: fleeSeconds,
            predicate: () => !gait.isWalking()
        });
        if (!isCurrent(id) || escape === interrupted) return interrupted;

        const cornered = escape === condition && !gait.isWalking();
        gait.stop();
        if (cornered) {
            const hopResult = await performHop(dir, id);
            if (!isCurrent(id) || hopResult === interrupted) return interrupted;
        }

        fleeing = false;
        return complete;
    };

    const walkTo = async (targetX, id) => {
        if (!isCurrent(id)) return {result: interrupted, dir: 1};
        const startX = dot.pos().x;
        const dir = targetX >= startX ? 1 : -1;
        gait.setFacing(dir);
        if (Math.abs(targetX - startX) <= arrivalDistance) {
            gait.stop();
            return {result: arrived, dir};
        }

        let reached = false;
        gait.walk(dir);
        const walkResult = await waitForStep(id, {
            predicate: () => {
                const x = dot.pos().x;
                reached = Math.abs(targetX - x) <= arrivalDistance
                    || (dir === 1 ? x >= targetX : x <= targetX);
                return reached || !gait.isWalking();
            }
        });
        if (!isCurrent(id) || walkResult === interrupted) return {result: interrupted, dir};
        gait.stop();
        if (walkResult === flee) return {result: flee, dir};
        return {result: reached ? arrived : ended, dir};
    };

    const handleSurfaceEnd = async (targetX, dir, id) => {
        const peerResult = await waitForAction(gait.peer(), id);
        if (!isCurrent(id) || peerResult === interrupted) return interrupted;
        if (peerResult === flee) return flee;

        const world = dot.world();
        const targetIsBelow = dot.surface() === 'line'
            && (targetX < world.lineLeft || targetX > world.lineRight);
        if (targetIsBelow) {
            const hopResult = await performHop(dir, id);
            if (!isCurrent(id) || hopResult === interrupted) return interrupted;
            return hopped;
        }

        gait.setFacing(-dir);
        return skipped;
    };

    const workOnTarget = async (target, kind, swingCount, id) => {
        let completedSwings = 0;
        while (isCurrent(id)) {
            const targetX = damage.targetX(target);
            const approach = await walkTo(targetX, id);
            if (!isCurrent(id) || approach.result === interrupted) return interrupted;
            if (approach.result === flee) {
                const fleeResult = await performFlee(id);
                if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
                continue;
            }
            if (approach.result === ended) {
                const edgeResult = await handleSurfaceEnd(targetX, approach.dir, id);
                if (!isCurrent(id) || edgeResult === interrupted) return interrupted;
                if (edgeResult === flee) {
                    const fleeResult = await performFlee(id);
                    if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
                    continue;
                }
                if (edgeResult === hopped) continue;
                return skipped;
            }

            let movedAway = false;
            while (completedSwings < swingCount) {
                const swingResult = await waitForAction(gait.swing(kind), id);
                if (!isCurrent(id) || swingResult === interrupted) return interrupted;
                if (swingResult === flee) {
                    const fleeResult = await performFlee(id);
                    if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
                    movedAway = true;
                    break;
                }
                completedSwings += 1;
            }
            if (movedAway) continue;
            return complete;
        }
        return interrupted;
    };

    const runWorking = async (id) => {
        const breakStarted = performance.now();
        const unreachableTargets = new Set();
        let skippedPassStart = null;

        while (isCurrent(id)
            && !damage.isFullyBroken()
            && performance.now() - breakStarted < breakWindowMs) {
            const target = damage.nextBreakTarget();
            if (!target) break;
            if (unreachableTargets.has(target)) {
                if (target === skippedPassStart) break;
                if (!skippedPassStart) skippedPassStart = target;
                continue;
            }

            const result = await workOnTarget(target, 'axe', 3, id);
            if (!isCurrent(id) || result === interrupted) return interrupted;
            if (result === skipped) {
                unreachableTargets.add(target);
                if (!skippedPassStart) skippedPassStart = target;
                continue;
            }
            skippedPassStart = null;
            damage.breakStage(target);
        }

        if (!isCurrent(id)) return interrupted;
        clearWorkPose();
        skippedPassStart = null;
        while (isCurrent(id) && !damage.isFullyFixed()) {
            const target = damage.nextFixTarget();
            if (!target) break;
            if (unreachableTargets.has(target)) {
                if (target === skippedPassStart) break;
                if (!skippedPassStart) skippedPassStart = target;
                continue;
            }

            const result = await workOnTarget(target, 'hammer', 2, id);
            if (!isCurrent(id) || result === interrupted) return interrupted;
            if (result === skipped) {
                unreachableTargets.add(target);
                if (!skippedPassStart) skippedPassStart = target;
                continue;
            }
            skippedPassStart = null;
            damage.fixStage(target);
        }

        return isCurrent(id) ? complete : interrupted;
    };

    const live = async (id) => {
        const sprouted = await waitForStep(id, {
            canFlee: false,
            predicate: () => dot.isAsleep() && dot.el.classList.contains('sprouted')
        });
        if (!isCurrent(id) || sprouted === interrupted) return;
        active = true;

        while (isCurrent(id)) {
            clearWorkPose();
            gait.idle(true);
            const rested = await waitForStep(id, {seconds: restSeconds});
            if (!isCurrent(id) || rested === interrupted) return;
            gait.idle(false);
            if (rested === flee) {
                const fleeResult = await performFlee(id);
                if (!isCurrent(id) || fleeResult === interrupted) return;
                continue;
            }

            const workResult = await runWorking(id);
            if (!isCurrent(id) || workResult === interrupted) return;
        }
    };

    const beginFreshRun = () => {
        runId += 1;
        cancelPending(interrupted);
        active = false;
        fleeRequested = false;
        fleeing = false;
        plannedHop = null;
        stopPoses();
        const id = runId;
        void live(id);
    };

    const onSleepChange = (asleep) => {
        if (motionDisabled) return;
        if (!asleep) {
            if (plannedHop && !plannedHop.landed && !dot.isDragging()) {
                dot.el.classList.add('sprouted');
                return;
            }
            interruptRun();
            return;
        }
        if (plannedHop) {
            plannedHop.landed = true;
            return;
        }
        beginFreshRun();
    };

    const onMotionPreferenceChange = (event) => {
        motionDisabled = event.matches;
        if (motionDisabled) {
            interruptRun();
        } else if (dot.isAsleep()) {
            beginFreshRun();
        }
    };

    const start = () => {
        if (started || reduceMotion.matches) return;
        started = true;
        motionDisabled = false;
        window.addEventListener('mousemove', (event) => {
            mouseX = event.clientX;
            mouseY = event.clientY;
        });
        reduceMotion.addEventListener('change', onMotionPreferenceChange);
        dot.onStep(onStep);
        dot.onSleepChange(onSleepChange);
        if (dot.isAsleep()) beginFreshRun();
    };

    return {start};
}
