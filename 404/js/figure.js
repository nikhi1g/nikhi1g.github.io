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
    const aimEye = () => {
        if (mouseX === null) return;

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

        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        const distance = Math.hypot(dx, dy);
        const target = sprouted ? irisEl : pupilEl;
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
        if (dot.isAsleep()) aimEye();
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
    const aimWhileAsleep = () => {
        if (!dot.isAsleep()) return;
        aimEye();
        requestAnimationFrame(aimWhileAsleep);
    };
    dot.onSleepChange((asleep) => {
        if (asleep) {
            scheduleBlink();
            requestAnimationFrame(aimWhileAsleep);
            // Settled: give it a beat, then unfold the rig.
            if (!reduceMotion.matches) sproutTimer = setTimeout(() => {
                sprouted = true;
                statusDot.classList.add('sprouted');
            }, 1200);
        } else {
            clearTimeout(blinkTimer);
            clearTimeout(sproutTimer);
            sprouted = false;
            clearBlink();
            pupilEl.style.removeProperty('transform');
            irisEl.style.removeProperty('transform');
            statusDot.classList.remove('sprouted');   // any motion curls it back up
        }
    });
}
