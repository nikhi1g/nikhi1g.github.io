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
    const irisReach = 3.2;              // viewBox units; leaves the iris edge inside the sclera
    const scleraOffsetX = 0.6;          // viewBox units from the skull centre
    const scleraOffsetY = -0.4;
    let mouseX = null;
    let mouseY = null;
    let sprouted = false;
    // A creature-ordered ball (the startle curl) suppresses the automatic
    // re-sprout until the creature calls sproutFigure. A user drop clears it,
    // so the figure still unfolds on its own after being thrown.
    let manualBall = false;
    // Set by the creature while it is backing away from the cursor. The rig's
    // eye is a cone in this state, so aimEye pins the iris instead of aiming it.
    let squinting = false;
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
            const bearing = Math.round(Math.atan2(dx, -dy) * 180 / Math.PI);
            statusDot.style.setProperty('--gaze', `${bearing}deg`);
            // The rig gets its own copy. `.face-left` mirrors the whole rig with
            // `scale: -1 1`, and a reflection is not a rotation: it negates the
            // bearing. Rotating the eyeball by the raw screen bearing would aim
            // the cone at the cursor's mirror image whenever it faces left.
            statusDot.style.setProperty('--gaze-rig', `${bearing * horizontalDirection}deg`);
        }

        // While narrowed the cone carries the aim: it is rotated to the bearing
        // and the eye is pinned to its wide end. Translating by the gaze as well
        // would double up on that rotation and slide it off the axis.
        //
        // Ball: CSS pins the pupil, nothing to do here.
        if (manualBall && !sprouted) return;
        // Rig: the cone is the rotated #eyeball, so the iris is offset in the
        // eyeball's OWN rotating frame — a fixed step back along its local axis
        // puts it at the wide end whichever way the cone is pointing.
        if (squinting && sprouted) {
            irisEl.style.transform = `translate(${-irisReach}px, 0px)`;
            return;
        }

        if (!distance) {
            target.style.transform = 'translate(0px, 0px)';
            return;
        }

        const reachCss = Math.min(distance / 8, maxReachCss);
        // SVG transforms use viewBox units, so convert the desired screen-pixel
        // displacement back to the rig's coordinate system.
        const shiftX = (dx / distance) * reachCss / outputScale * horizontalDirection;
        const shiftY = (dy / distance) * reachCss / outputScale;
        target.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
    };
    window.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        // A startled ball keeps watching the pointer even while it is still in
        // the air, so the aim is not gated on being settled.
        if (dot.isAsleep() || manualBall) aimEye();
    });
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
    const scheduleBlink = () => {
        clearTimeout(blinkTimer);
        blinkTimer = setTimeout(() => {
            blink(Math.random() < 0.25 ? 2 : 1);   // occasional double blink
            scheduleBlink();
        }, 2600 + Math.random() * 3800);
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
        squinting = false;
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
    // same cone the wary ball wears, keyed off `.squinting` and aimed by --gaze.
    const setSquint = (on) => {
        const next = Boolean(on);
        if (next === squinting) return;
        squinting = next;
        statusDot.classList.toggle('squinting', squinting);
        // Leaving the cone: drop the pinned offset so the next aim starts clean.
        if (!squinting) irisEl.style.removeProperty('transform');
        aimEye();
    };
    dot.onSleepChange((asleep) => {
        if (asleep) {
            scheduleBlink();
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
