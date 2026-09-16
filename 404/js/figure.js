export function initFigure(dot) {
    const statusDot = dot.el;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const eyeEl = statusDot.querySelector('.eye');
    const pupilEl = statusDot.querySelector('.pupil');
    const figureEl = statusDot.querySelector('.figure');
    const skullEl = statusDot.querySelector('.skull');
    const irisEl = statusDot.querySelector('.iris');
    const eyeballEl = statusDot.querySelector('#eyeball');
    const viewBoxWidth = figureEl.viewBox.baseVal.width;
    const pupilReach = 1.5;             // CSS px the ball-state pupil can travel
    // Sclera r5.7, iris r2.8 (see 404.html), so 2.4 keeps the iris edge inside
    // the white with room to spare: 2.4 + 2.8 < 5.7.
    const irisReach = 2.4;              // viewBox units
    // The eyeball is concentric with the skull now, so there is no offset.
    const scleraOffsetX = 0.2;          // viewBox units from the skull centre
    const scleraOffsetY = -0.1;
    let mouseX = null;
    let mouseY = null;
    let sprouted = false;
    // A creature-ordered ball (the startle curl) suppresses the automatic
    // re-sprout until the creature calls sproutFigure. A user drop clears it,
    // so the figure still unfolds on its own after being thrown.
    let manualBall = false;
    // Set by the creature while it is backing away from the cursor: a 0..1 alarm
    // level, not a flag. The rig's eye narrows toward a cone as it rises, so
    // aimEye blends the iris from aimed to pinned by the same value.
    let squinting = 0;
    // Published gaze angles, kept CONTINUOUS rather than wrapped to a single
    // turn, so a cursor crossing straight down does not make the eye unwind a
    // whole revolution. null until the first aim.
    let gazeAngle = null;
    let gazeRigAngle = null;
    // What was last written out: the smoothed value, and the last string, so a
    // frame that would change nothing does not touch the style at all.
    let gazeShown = null;
    let gazeRigShown = null;
    const written = new Map();
    const GAZE_SMOOTH = 0.28;      // per-frame approach toward the true bearing
    const GAZE_DEADBAND = 0.4;     // degrees; below this nothing is rewritten

    const publishAngle = (name, degrees) => {
        const rounded = Math.round(degrees * 10) / 10;
        const previous = written.get(name);
        if (previous !== undefined && Math.abs(previous - rounded) < GAZE_DEADBAND) return;
        written.set(name, rounded);
        statusDot.style.setProperty(name, `${rounded}deg`);
    };

    // Carry `raw` to whichever revolution is nearest `prev`: the result differs
    // from prev by at most 180 degrees, so the eye always turns the short way.
    const unwrapAngle = (prev, raw) => {
        if (prev === null) return raw;
        return prev + ((((raw - prev) % 360) + 540) % 360) - 180;
    };
    // When the pointer has been still for a while the creature stops watching it
    // and looks at whatever it is about to do instead. The creature sets this.
    let lookTarget = null;
    const setLookTarget = (point) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            lookTarget = null;
            return;
        }
        lookTarget = {x: point.x, y: point.y};
    };
    // The point the eye should actually track right now.
    const gazePoint = () => {
        if (lookTarget) return lookTarget;
        if (mouseX === null || mouseY === null) return null;
        return {x: mouseX, y: mouseY};
    };
    const aimEye = () => {
        const gaze = gazePoint();
        if (!gaze) return;

        let centerX;
        let centerY;
        let maxReachCss;
        let outputScale = 1;
        let horizontalDirection = 1;
        if (sprouted) {
            const figureBox = figureEl.getBoundingClientRect();
            const scale = figureBox.width / viewBoxWidth;
            if (!scale) return;

            // The skull never moves within the rig, so its rect cannot feed the
            // iris's previous translation back into the next gaze calculation.
            const skullBox = skullEl.getBoundingClientRect();
            horizontalDirection = statusDot.classList.contains('face-left') ? -1 : 1;
            centerX = skullBox.left + skullBox.width / 2
                + scleraOffsetX * scale * horizontalDirection;
            centerY = skullBox.top + skullBox.height / 2 + scleraOffsetY * scale;
            maxReachCss = irisReach * scale;
            outputScale = scale;
        } else {
            const eyeBox = eyeEl.getBoundingClientRect();
            centerX = eyeBox.left + eyeBox.width / 2;
            centerY = eyeBox.top + eyeBox.height / 2;
            maxReachCss = pupilReach;
        }

        const dx = gaze.x - centerX;
        const dy = gaze.y - centerY;
        const distance = Math.hypot(dx, dy);
        const target = sprouted ? irisEl : pupilEl;

        // The gaze bearing, clockwise from twelve o'clock, in SCREEN space —
        // the narrowed eyes are cones rotated by this, so it is published before
        // the early returns below.
        if (distance) {
            const bearing = Math.atan2(dx, -dy) * 180 / Math.PI;
            // Unwrapped, NOT clamped to (-180, 180]. atan2 jumps from 179 to
            // -179 as the cursor crosses straight down, and CSS then rotates the
            // eye 358 degrees the long way round — the spin-back. Accumulating
            // the shortest delta keeps the published angle continuous, so the
            // eye always turns the short way and never unwinds.
            gazeAngle = unwrapAngle(gazeAngle, bearing);
            // Then SMOOTHED, and only written when it actually moves. The raw
            // bearing is recomputed every frame from boxes that shift by
            // fractions of a pixel, and writing that straight out — with a CSS
            // transition also chasing it — is what made the narrowed eye jitter
            // and twitch while the cursor moved. A low-pass on the angle plus a
            // deadband is enough to settle it without adding lag worth seeing.
            gazeShown = gazeShown === null
                ? gazeAngle
                : gazeShown + (gazeAngle - gazeShown) * GAZE_SMOOTH;
            publishAngle('--gaze', gazeShown);
            // The rig gets its own copy. `.face-left` mirrors the whole rig with
            // `scale: -1 1`, and a reflection is not a rotation: it negates the
            // bearing. Rotating the eyeball by the raw screen bearing would aim
            // the cone at the cursor's mirror image whenever it faces left.
            // Unwrapped separately, because flipping facing negates the target
            // and would otherwise be its own long way round.
            gazeRigAngle = unwrapAngle(gazeRigAngle, bearing * horizontalDirection);
            gazeRigShown = gazeRigShown === null
                ? gazeRigAngle
                : gazeRigShown + (gazeRigAngle - gazeRigShown) * GAZE_SMOOTH;
            publishAngle('--gaze-rig', gazeRigShown);
        }

        // While narrowed the cone carries the aim: it is rotated to the bearing
        // and the eye is pinned to its wide end. Translating by the gaze as well
        // would double up on that rotation and slide it off the axis.
        //
        // Ball: CSS pins the pupil, nothing to do here.
        if (manualBall && !sprouted) return;

        if (!distance) {
            target.style.transform = 'translate(0px, 0px)';
            return;
        }

        const reachCss = Math.min(distance / 8, maxReachCss);
        // SVG transforms use viewBox units, so convert the desired screen-pixel
        // displacement back to the rig's coordinate system.
        const shiftX = (dx / distance) * reachCss / outputScale * horizontalDirection;
        const shiftY = (dy / distance) * reachCss / outputScale;

        // Rig, narrowing: the cone is the rotated #eyeball, so the iris belongs
        // at the cone's wide end — a fixed step back along the eyeball's OWN
        // rotating local axis, whichever way the cone points. It is blended in
        // by the alarm level rather than switched, so the iris slides into the
        // corner as the eye closes instead of jumping there.
        if (squinting > 0 && sprouted) {
            const pinned = -irisReach;
            // Drawn up off the cone's axis as it narrows, so the cone's upper
            // edge crops the top of the iris harder than its lower edge crops
            // the bottom — the same heavier-lid-on-top read as the ball.
            const pinnedY = -0.9;
            irisEl.style.transform =
                `translate(${shiftX + (pinned - shiftX) * squinting}px, ${shiftY + (pinnedY - shiftY) * squinting}px)`;
            return;
        }

        target.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
    };
    window.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        // A startled ball keeps watching the pointer even while it is still in
        // the air, so the aim is not gated on being settled.
        if (dot.isAsleep() || manualBall) aimEye();
    });
    // Forget the pointer once it leaves the window or the window loses
    // focus: a stale position would keep it retreating and squinting at a
    // cursor that is no longer there.
    const forgetPointer = () => {
        mouseX = null;
        mouseY = null;
    };
    document.addEventListener('mouseout', (event) => {
        if (!event.relatedTarget) forgetPointer();
    });
    window.addEventListener('blur', forgetPointer);
    // Idle blinks: a lid-drop every few seconds, sometimes twice in quick succession.
    let blinkTimer;
    let sproutTimer;
    const clearBlink = () => {
        statusDot.classList.remove('blinking');
        eyeEl.style.removeProperty('transform');
        eyeballEl.style.removeProperty('transform');
    };
    const blink = (times) => {
        if (!dot.isAsleep()) return;
        statusDot.classList.add('blinking');
        setTimeout(() => {
            clearBlink();
            if (times > 1) setTimeout(() => blink(times - 1), 140);
        }, 90);
    };
    // `firstDelay` brings the next blink forward. The default idle cadence is
    // 2.6-6.4s, which is longer than the startle stare lasts — and the hop
    // cancels whatever was pending — so a curled, staring creature would
    // usually never blink at all before unfolding.
    const scheduleBlink = (firstDelay) => {
        clearTimeout(blinkTimer);
        const delay = Number.isFinite(firstDelay)
            ? firstDelay
            : 2600 + Math.random() * 3800;
        blinkTimer = setTimeout(() => {
            blink(Math.random() < 0.25 ? 2 : 1);   // occasional double blink
            scheduleBlink();
        }, delay);
    };
    // The eye tracks its gaze target for as long as there is an eye to aim:
    // while settled, and throughout an ordered ball, which spans the startle
    // hop and so is not settled for most of its life.
    const aimWhileWatching = () => {
        if (!dot.isAsleep() && !manualBall) return;
        aimEye();
        requestAnimationFrame(aimWhileWatching);
    };
    const doCurl = () => {
        sprouted = false;
        clearBlink();
        pupilEl.style.removeProperty('transform');
        irisEl.style.removeProperty('transform');
        statusDot.classList.remove('sprouted');
        // The rig's cone belongs to the rig; the ball wears its own.
        squinting = 0;
        statusDot.classList.remove('squinting');
    };
    // Ordered ball: the creature wants the ball held, eye narrowed and locked
    // on the pointer, until it calls sproutFigure. The aim loop is restarted
    // here because the startle hop leaves the dot awake, and the settled loop
    // would have already stopped.
    const curlUp = () => {
        manualBall = true;
        clearTimeout(sproutTimer);
        doCurl();
        statusDot.classList.add('wary');
        requestAnimationFrame(aimWhileWatching);
    };
    const sproutFigure = () => {
        manualBall = false;
        statusDot.classList.remove('wary');
        if (!dot.isAsleep()) return;
        sprouted = true;
        statusDot.classList.add('sprouted');
    };

    // The rig narrows its eye while it is backing away from the cursor — the
    // same cone the wary ball wears, keyed off `.squinting` and aimed by
    // --gaze-rig. `level` is a 0..1 alarm, not a flag: the cone opens and closes
    // continuously with how near the cursor is, so the creature looks more
    // suspicious the more hurried it is.
    const setSquint = (level) => {
        const raw = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
        // Quantised to 2%, because the clip-path is rebuilt from this value on
        // every write and a continuously jittering fraction shimmers the eye's
        // edges for no visible gain.
        const next = Math.round(raw * 50) / 50;
        const wasOn = squinting > 0;
        if (next === squinting) return;
        squinting = next;
        statusDot.style.setProperty('--squint', String(next));
        // Kept off entirely below a threshold, so a cursor loitering at the very
        // edge of the flee box does not leave a permanent hairline squint.
        const on = next > 0.02;
        statusDot.classList.toggle('squinting', on);
        if (!on && wasOn) irisEl.style.removeProperty('transform');
        aimEye();
    };
    dot.onSleepChange((asleep) => {
        if (asleep) {
            // A held ball is mid-startle and only has a few seconds of stare, so
            // it blinks soon after landing rather than on the idle cadence.
            scheduleBlink(manualBall ? 500 + Math.random() * 700 : undefined);
            requestAnimationFrame(aimWhileWatching);
            // Settled: give it a beat, then unfold the rig — unless the ball
            // was ordered and is still being held.
            if (!manualBall && !reduceMotion.matches) sproutTimer = setTimeout(() => {
                sprouted = true;
                statusDot.classList.add('sprouted');
            }, 1200);
        } else {
            clearTimeout(blinkTimer);
            clearTimeout(sproutTimer);
            // Only a user grab or drop curls the figure now. Creature hops,
            // falls and scripted steps wake the dot without touching the rig.
            const userCaused = dot.isDragging()
                || (typeof dot.consumeDrop === 'function' && dot.consumeDrop());
            if (!userCaused) return;
            manualBall = false;
            statusDot.classList.remove('wary');
            doCurl();
        }
    });

    return {setLookTarget, curlUp, sproutFigure, setSquint};
}
