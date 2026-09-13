export function createCreature({dot, gait, damage, stairs, arrow}) {
    const restSeconds = 1;
    const headingAttackLimit = 8;
    const commitAttackLimit = 5;
    const arrivalDistance = 6;
    const fleeDistance = 130;
    const leanDistance = 190;
    const fleeCooldownMs = 900;
    const fleeForceThreshold = 70;
    const fleeOdds = 0.82;
    const fleeSeconds = 1.2;
    const footVerticalReach = 30;
    const standOffDistance = 14;
    const climbStallSeconds = 0.5;
    const motionEpsilon = 0.75;
    const surfaceEpsilon = 0.5;

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
    let sequenceDone = false;
    let fleeRequested = false;
    let fleeing = false;
    let plannedHop = null;
    let mouseX = null;
    let mouseY = null;
    let lastFleeRoll = -Infinity;
    let leanAmount = 0;
    let stairRoute = null;

    const isCurrent = (id) => id === runId && !motionDisabled;

    const clearWorkPose = () => {
        dot.el.classList.remove('peering', 'swinging', 'holding-axe', 'holding-hammer', 'building');
    };

    const clearStairs = () => {
        if (stairs && typeof stairs.clear === 'function') stairs.clear();
        stairRoute = null;
        dot.el.classList.remove('building');
    };

    const stopPoses = () => {
        gait.stopClimb();
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
            'holding-hammer',
            'building'
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
        clearStairs();
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
        gait.stopClimb();
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
                const chance = distance <= fleeForceThreshold ? 1 : fleeOdds;
                if (Math.random() < chance) requestFlee();
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

        const hasStairs = stairs
            && typeof stairs.hasAny === 'function'
            && stairs.hasAny();
        if (hasStairs && stairRoute && dot.surface() === 'platform') {
            const descentResult = await walkDownStairs(id, {canFlee: false});
            if (!isCurrent(id) || descentResult === interrupted) return interrupted;
        }
        if (hasStairs) clearStairs();

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
        if (cornered && dot.surface() !== 'platform') {
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

    const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

    const approachFor = (rect, span = dot.surfaceSpan()) => {
        if (!span || !rect) return null;
        const distanceAboveSurface = span.y - rect.bottom;
        const lineTolerance = span.kind === 'line' ? footVerticalReach : 0;
        const overlapsReachBand = distanceAboveSurface >= -(footVerticalReach + arrivalDistance)
            && distanceAboveSurface <= footVerticalReach + arrivalDistance;
        const overlapsSurface = rect.right >= span.left - standOffDistance - lineTolerance
            && rect.left <= span.right + standOffDistance + lineTolerance;
        if (!overlapsReachBand || !overlapsSurface) return null;

        const x = dot.pos().x;
        const useLeftEdge = Math.abs(x - rect.left) <= Math.abs(x - rect.right);
        return {
            x: clamp(
                useLeftEdge ? rect.left - standOffDistance : rect.right + standOffDistance,
                span.left,
                span.right
            ),
            facing: useLeftEdge ? 1 : -1
        };
    };

    const standBeside = (rect) => {
        if (!rect) return null;
        const world = dot.world();
        const x = dot.pos().x;
        const leftX = clamp(rect.left - standOffDistance, world.left, world.right);
        const rightX = clamp(rect.right + standOffDistance, world.left, world.right);
        const useLeftEdge = Math.abs(x - leftX) <= Math.abs(x - rightX);
        return {
            x: useLeftEdge ? leftX : rightX,
            facing: useLeftEdge ? 1 : -1
        };
    };

    const performFleeIfNeeded = async (id) => {
        if (!fleeRequested) return complete;
        return performFlee(id);
    };

    const approachOnFoot = async (target, initialRect, id) => {
        let rect = initialRect;
        while (isCurrent(id)) {
            const plan = approachFor(rect);
            if (!plan) return skipped;

            const approach = await walkTo(plan.x, id);
            if (!isCurrent(id) || approach.result === interrupted) return interrupted;
            if (approach.result === flee) {
                const fleeResult = await performFlee(id);
                if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
                rect = damage.targetRect(target);
                continue;
            }
            if (approach.result === ended) {
                const edgeResult = await handleSurfaceEnd(plan.x, approach.dir, id);
                if (!isCurrent(id) || edgeResult === interrupted) return interrupted;
                if (edgeResult === flee) {
                    const fleeResult = await performFlee(id);
                    if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
                    rect = damage.targetRect(target);
                    continue;
                }
                if (edgeResult === hopped) {
                    rect = damage.targetRect(target);
                    continue;
                }
                return skipped;
            }

            const latestRect = damage.targetRect(target);
            const latestPlan = approachFor(latestRect);
            if (!latestPlan) return skipped;
            if (Math.abs(latestPlan.x - dot.pos().x) > arrivalDistance) {
                rect = latestRect;
                continue;
            }
            gait.setFacing(latestPlan.facing);
            return complete;
        }
        return interrupted;
    };


    const walkDownStairs = async (id, {canFlee = true} = {}) => {
        if (!stairRoute || dot.surface() !== 'platform') return complete;

        const position = dot.pos();
        const dir = stairRoute.baseX < position.x
            ? -1
            : (stairRoute.baseX > position.x ? 1 : -stairRoute.direction);
        let motionAnchor = position;
        gait.setFacing(dir);
        gait.climb(dir, stairRoute.mode);

        while (isCurrent(id)) {
            let reachedBase = false;
            let moved = false;
            const travelResult = await waitForStep(id, {
                canFlee,
                seconds: climbStallSeconds,
                predicate: () => {
                    reachedBase = dot.isGrounded() && dot.surface() !== 'platform';
                    if (reachedBase) return true;

                    const position = dot.pos();
                    moved = Math.abs(position.x - motionAnchor.x) >= motionEpsilon
                        || Math.abs(position.y - motionAnchor.y) >= motionEpsilon;
                    return moved;
                }
            });
            if (!isCurrent(id) || travelResult === interrupted) {
                gait.stopClimb();
                return interrupted;
            }
            if (travelResult === flee) {
                gait.stopClimb();
                return flee;
            }
            if (reachedBase) {
                gait.stopClimb();
                return complete;
            }
            if (moved) {
                motionAnchor = dot.pos();
                continue;
            }

            gait.stopClimb();
            return skipped;
        }

        gait.stopClimb();
        return interrupted;
    };

    const abandonStairs = async (id) => {
        gait.stop();
        if (isCurrent(id) && stairRoute && dot.surface() === 'platform') {
            await walkDownStairs(id, {canFlee: false});
        }
        clearStairs();
        return isCurrent(id) ? skipped : interrupted;
    };

    const climbStairs = async (rect, id) => {
        if (!stairRoute) return skipped;

        const dir = stairRoute.direction;
        let lastPosition = dot.pos();
        let lastSurface = dot.surfaceSpan();
        let motionAnchor = lastPosition;
        let gainedHeight = false;
        let stalls = 0;

        gait.setFacing(dir);
        gait.climb(dir, stairRoute.mode);

        while (isCurrent(id)) {
            let reachedWorkSurface = false;
            let moved = false;
            const climbResult = await waitForStep(id, {
                seconds: climbStallSeconds,
                predicate: () => {
                    const position = dot.pos();
                    const surface = dot.surfaceSpan();
                    const positionMovedUp = position.y < lastPosition.y - surfaceEpsilon;
                    const changedSurface = surface
                        && lastSurface
                        && (surface.kind !== lastSurface.kind
                            || Math.abs(surface.y - lastSurface.y) > surfaceEpsilon);
                    const surfaceMovedUp = changedSurface
                        && surface.y <= lastSurface.y + surfaceEpsilon;
                    if (positionMovedUp
                        || surfaceMovedUp
                        || position.y < stairRoute.baseY - surfaceEpsilon) {
                        gainedHeight = true;
                    }

                    lastPosition = position;
                    if (surface) lastSurface = surface;

                    reachedWorkSurface = gainedHeight
                        && Boolean(approachFor(rect, surface));
                    if (reachedWorkSurface) return true;

                    moved = Boolean(surfaceMovedUp)
                        || Math.abs(position.x - motionAnchor.x) >= motionEpsilon
                        || Math.abs(position.y - motionAnchor.y) >= motionEpsilon;
                    return moved;
                }
            });

            if (!isCurrent(id) || climbResult === interrupted) {
                gait.stopClimb();
                clearStairs();
                return interrupted;
            }
            if (climbResult === flee) {
                gait.stopClimb();
                return flee;
            }
            if (reachedWorkSurface) {
                gait.stopClimb();
                return complete;
            }
            if (moved) {
                motionAnchor = dot.pos();
                continue;
            }

            gait.stopClimb();
            stalls += 1;
            if (stalls >= 2) {
                clearStairs();
                return skipped;
            }

            const hopResult = await performHop(dir, id);
            if (!isCurrent(id) || hopResult === interrupted) {
                clearStairs();
                return interrupted;
            }
            lastSurface = dot.surfaceSpan();
            lastPosition = dot.pos();
            motionAnchor = lastPosition;
            gait.setFacing(dir);
            gait.climb(dir, stairRoute.mode);
        }

        gait.stopClimb();
        clearStairs();
        return interrupted;
    };

    const buildAndClimb = async (target, rect, id) => {
        if (!stairs
            || typeof stairs.planTo !== 'function'
            || typeof stairs.buildNext !== 'function'
            || typeof stairs.isComplete !== 'function'
            || typeof stairs.hasAny !== 'function'
            || typeof stairs.teardownNext !== 'function'
            || typeof stairs.clear !== 'function'
            || typeof stairs.mode !== 'function') {
            return skipped;
        }

        clearStairs();
        const destination = standBeside(rect);
        const basePosition = dot.pos();
        if (!destination) return skipped;

        stairs.planTo(destination.x, rect.bottom);
        stairRoute = {
            baseX: basePosition.x,
            baseY: basePosition.y,
            direction: destination.x < basePosition.x ? -1 : 1
        };
        gait.setFacing(stairRoute.direction);
        if (stairs.isComplete()) {
            clearStairs();
            return skipped;
        }

        dot.el.classList.add('building');
        try {
            while (isCurrent(id) && !stairs.isComplete()) {
                const swingResult = await waitForAction(gait.swing('hammer'), id);
                if (!isCurrent(id) || swingResult === interrupted) {
                    clearStairs();
                    return interrupted;
                }
                if (swingResult === flee) {
                    clearStairs();
                    const fleeResult = await performFlee(id);
                    if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
                    return flee;
                }

                const built = stairs.buildNext();
                if (built === false && !stairs.isComplete()) {
                    clearStairs();
                    return skipped;
                }
            }
        } finally {
            dot.el.classList.remove('building');
        }
        if (!isCurrent(id)) {
            clearStairs();
            return interrupted;
        }

        stairRoute.mode = stairs.mode();
        const climbResult = await climbStairs(damage.targetRect(target), id);
        if (!isCurrent(id) || climbResult === interrupted) return interrupted;
        if (climbResult === flee) {
            const fleeResult = await performFlee(id);
            if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
            return flee;
        }
        if (climbResult !== complete) return climbResult;

        const workPosition = approachFor(damage.targetRect(target));
        if (!workPosition) return abandonStairs(id);

        const approach = await walkTo(workPosition.x, id);
        if (!isCurrent(id) || approach.result === interrupted) {
            clearStairs();
            return interrupted;
        }
        if (approach.result === flee) {
            const fleeResult = await performFlee(id);
            if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
            return flee;
        }
        if (approach.result !== arrived) return abandonStairs(id);

        const latestPosition = approachFor(damage.targetRect(target));
        if (!latestPosition) return abandonStairs(id);
        gait.setFacing(latestPosition.facing);
        return complete;
    };

    const dismantleStairs = async (id) => {
        if (!stairs || typeof stairs.hasAny !== 'function' || !stairs.hasAny()) {
            stairRoute = null;
            return complete;
        }

        const descentResult = await walkDownStairs(id);
        if (!isCurrent(id) || descentResult === interrupted) {
            clearStairs();
            return interrupted;
        }
        if (descentResult === flee) {
            const fleeResult = await performFlee(id);
            return !isCurrent(id) || fleeResult === interrupted ? interrupted : complete;
        }
        if (descentResult !== complete) {
            clearStairs();
            return complete;
        }
        if (stairRoute) gait.setFacing(stairRoute.direction);

        while (isCurrent(id) && stairs.hasAny()) {
            const swingResult = await waitForAction(gait.swing('hammer'), id);
            if (!isCurrent(id) || swingResult === interrupted) {
                clearStairs();
                return interrupted;
            }
            if (swingResult === flee) {
                const fleeResult = await performFlee(id);
                return !isCurrent(id) || fleeResult === interrupted ? interrupted : complete;
            }

            const removed = stairs.teardownNext();
            if (removed === false && stairs.hasAny()) {
                clearStairs();
                return complete;
            }
        }

        stairRoute = null;
        return isCurrent(id) ? complete : interrupted;
    };

    const fireAtTarget = async (target, rect, id, options = {}) => {
        const weapon = options.weapon || 'arrow';
        const damageMode = options.damageMode || 'break';
        const fire = weapon === 'rocket' ? arrow?.fireRocket : arrow?.fire;

        if (!arrow
            || typeof arrow.canHit !== 'function'
            || typeof arrow.aimAt !== 'function'
            || typeof fire !== 'function') {
            return skipped;
        }

        arrow.aimAt(rect);
        try {
            await fire.call(arrow, rect);
        } catch {
            return interrupted;
        }
        if (!isCurrent(id)) return interrupted;

        if (damageMode === 'break') damage.breakStage(target);
        else damage.fixStage(target);

        const fleeResult = await performFleeIfNeeded(id);
        return !isCurrent(id) || fleeResult === interrupted ? interrupted : complete;
    };

    const workOnTarget = async (target, kind, swingCount, id, options = {}) => {
        const damageMode = options.damageMode || (kind === 'axe' ? 'break' : 'fix');
        const weapon = options.weapon || 'axe';
        let completedSwings = 0;
        while (isCurrent(id)) {
            const rect = damage.targetRect(target);
            if (!rect) return skipped;
            let usedStairs = false;
            let routeResult;

            const surface = dot.surfaceSpan();
            const targetIsHigh = rect.bottom
                < (surface ? surface.y : dot.pos().y) - footVerticalReach;

            if (approachFor(rect, surface)) {
                routeResult = await approachOnFoot(target, rect, id);
            } else if (kind === 'axe'
                && targetIsHigh
                && arrow
                && typeof arrow.canHit === 'function'
                && arrow.canHit(rect)) {
                return fireAtTarget(target, rect, id, {
                    weapon,
                    damageMode
                });
            } else {
                routeResult = await buildAndClimb(target, rect, id);
                usedStairs = routeResult === complete;
            }

            if (!isCurrent(id) || routeResult === interrupted) return interrupted;
            if (routeResult === flee) continue;
            if (routeResult === skipped) return skipped;

            let movedAway = false;
            while (completedSwings < swingCount) {
                const swingResult = await waitForAction(gait.swing(kind), id);
                if (!isCurrent(id) || swingResult === interrupted) {
                    clearStairs();
                    return interrupted;
                }
                if (swingResult === flee) {
                    const fleeResult = await performFlee(id);
                    if (!isCurrent(id) || fleeResult === interrupted) return interrupted;
                    movedAway = true;
                    break;
                }
                completedSwings += 1;
            }
            if (movedAway) continue;

            if (damageMode === 'break') damage.breakStage(target);
            else damage.fixStage(target);

            if (usedStairs) {
                const teardownResult = await dismantleStairs(id);
                if (!isCurrent(id) || teardownResult === interrupted) return interrupted;
            }
            return complete;
        }
        return interrupted;
    };

    const destroyTarget = async (target, {
        id,
        kind = 'axe',
        swings = 1,
        loops = 8,
        weapon = 'arrow',
        damageMode
    }) => {
        if (!isCurrent(id) || !target) return skipped;
        const isBroken = () => (
            typeof damage.isTargetBroken === 'function'
                ? damage.isTargetBroken(target)
                : false
        );

        for (let pass = 0; isCurrent(id) && pass < loops; pass += 1) {
            if (isBroken()) return complete;
            const result = await workOnTarget(target, kind, swings, id, {
                weapon,
                damageMode
            });
            if (!isCurrent(id) || result === interrupted) return interrupted;
            if (result === skipped) return skipped;
        }

        return isBroken() ? complete : skipped;
    };

    const runWorking = async (id) => {
        const heading = document.querySelector('h1');
        const commit = document.getElementById('inquiry-commit');
        const themeToggle = document.getElementById('theme-toggle');

        const headingResult = await destroyTarget(heading, {
            id,
            kind: 'axe',
            swings: 1,
            loops: headingAttackLimit,
            weapon: 'arrow',
            damageMode: 'break'
        });
        if (!isCurrent(id) || headingResult === interrupted) return interrupted;

        if (isCurrent(id) && commit) {
            const commitResult = await destroyTarget(commit, {
                id,
                kind: 'axe',
                swings: 1,
                loops: commitAttackLimit,
                weapon: 'rocket',
                damageMode: 'break'
            });
            if (!isCurrent(id) || commitResult === interrupted) return interrupted;
        }

        if (isCurrent(id) && themeToggle) {
            const themeResult = await destroyTarget(themeToggle, {
                id,
                kind: 'hammer',
                swings: 1,
                loops: 8,
                weapon: 'hammer',
                damageMode: 'break'
            });
            if (!isCurrent(id) || themeResult === interrupted) return interrupted;
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

        const rested = await waitForStep(id, {seconds: restSeconds});
        if (!isCurrent(id) || rested === interrupted) return;
        gait.idle(false);
        if (rested === flee) {
            const fleeResult = await performFlee(id);
            if (!isCurrent(id) || fleeResult === interrupted) return;
        }

        const workResult = await runWorking(id);
        if (!isCurrent(id) || workResult === interrupted) return;
        if (workResult === complete) {
            sequenceDone = true;
            clearWorkPose();
            stopPoses();
            clearStairs();
            return;
        }
    };

    const beginFreshRun = () => {
        runId += 1;
        cancelPending(interrupted);
        active = false;
        sequenceDone = false;
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
            if (dot.isDragging()) {
                interruptRun();
                return;
            }
            if (plannedHop && !plannedHop.landed) {
                dot.el.classList.add('sprouted');
                return;
            }
            return;
        }
        if (plannedHop) {
            plannedHop.landed = true;
            return;
        }
        if (!sequenceDone) {
            beginFreshRun();
        }
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
