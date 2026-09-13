export function initFigure(dot) {
    const statusDot = dot.el;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const eyeEl = statusDot.querySelector('.eye');
    const pupilEl = statusDot.querySelector('.pupil');
    const scleraEl = statusDot.querySelector('.sclera');
    const irisEl = statusDot.querySelector('.iris');
    const pupilReach = 1.5;             // px the ball-state pupil can travel
    const irisReach = 2.6;              // viewBox units the rig's iris can travel
    let mouseX = null;
    let mouseY = null;
    let sprouted = false;
    const aimEye = () => {
        if (mouseX === null) return;
        const target = sprouted ? scleraEl : eyeEl;
        const reachMax = sprouted ? irisReach : pupilReach;
        const box = target.getBoundingClientRect();
        const dx = mouseX - (box.left + box.width / 2);
        const dy = mouseY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(distance, reachMax * 8) / (reachMax * 8) * reachMax;
        const shift = `translate(${(dx / distance) * reach}px, ${(dy / distance) * reach}px)`;
        (sprouted ? irisEl : pupilEl).style.transform = shift;
    };
    window.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        if (dot.isAsleep()) aimEye();
    });
    // Idle blinks: a lid-drop every few seconds, sometimes twice in quick succession.
    let blinkTimer;
    let sproutTimer;
    const blink = (times) => {
        if (!dot.isAsleep()) return;
        statusDot.classList.add('blinking');
        setTimeout(() => {
            statusDot.classList.remove('blinking');
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
            statusDot.classList.remove('blinking');
            statusDot.classList.remove('sprouted');   // any motion curls it back up
        }
    });
}
