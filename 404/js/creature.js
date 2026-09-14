export function createCreature({dot, arrow, lasso}) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SHOT_GAP_MS = 250;
    const FLEE_RADIUS = 170;
    const FLEE_SPEED = 170;

    let started = false;
    let done = false;
    let runId = 0;
    let mouseX = null;
    let mouseY = null;
    let fleeing = false;
    const isCurrent = (id) => id === runId && !reduceMotion.matches;

    const splitHeading = () => {
        const h1 = document.querySelector('h1');
        if (!h1) return [];
        if (!h1.querySelector('.letter')) {
            const chars = Array.from(h1.textContent);
            h1.replaceChildren();
            for (const ch of chars) {
                const span = document.createElement('span');
                span.className = 'letter';
                span.textContent = ch;
                h1.appendChild(span);
            }
        }
        return [...h1.querySelectorAll('.letter:not(.letter-gap)')].slice(0, 3);
    };

    const waitForSprouted = async (id) => {
        for (let i = 0; i < 60; i += 1) {
            if (!isCurrent(id)) return false;
            if (dot.el.classList.contains('sprouted')) return true;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return isCurrent(id) && dot.el.classList.contains('sprouted');
    };

    const knockOffLetter = (letter, impact) => {
        const rect = letter.getBoundingClientRect();
        if (!rect || rect.width < 1 || rect.height < 1) return;
        const h1 = letter.parentElement;

        const style = window.getComputedStyle(letter.parentElement || letter);
        if (style.font) letter.style.font = style.font;
        if (style.color) letter.style.color = style.color;
        if (style.lineHeight) letter.style.lineHeight = style.lineHeight;

        letter.style.position = 'fixed';
        letter.style.left = `${rect.left}px`;
        letter.style.top = `${rect.top}px`;
        letter.style.width = `${rect.width}px`;
        letter.style.height = `${rect.height}px`;
        letter.style.margin = '0';
        letter.style.zIndex = '3';
        letter.style.pointerEvents = 'none';
        if (h1) {
            const gap = document.createElement('span');
            gap.className = 'letter letter-gap';
            gap.textContent = letter.textContent;
            gap.style.visibility = 'hidden';
            h1.insertBefore(gap, letter);
        }

        const vx = impact && Number.isFinite(impact.vx)
            ? impact.vx * 0.18 + (Math.random() - 0.5) * 60
            : (Math.random() - 0.5) * 80;
        const vy = impact && Number.isFinite(impact.vy)
            ? -140 + impact.vy * 0.08
            : -140;
        dot.spawnDebris(letter, rect.left, rect.top, vx, vy, (Math.random() - 0.5) * 120);
    };

    const run = async (id) => {
        const ready = await waitForSprouted(id);
        if (!ready || !isCurrent(id) || done) return;
        if (!arrow || typeof arrow.fire !== 'function') return;

        const letters = splitHeading();
        if (letters.length === 0) return;

        for (const letter of letters) {
            if (!isCurrent(id) || done) return;
            if (!dot.isAsleep()) return;
            let impact = null;
            try {
                impact = await arrow.fire(rect);
            } catch {
                return;
            }
            if (!isCurrent(id)) return;
            if (letter.isConnected) {
                try {
                    knockOffLetter(letter, impact);
                } catch {
                    continue;
                }
            }
            await new Promise((resolve) => setTimeout(resolve, SHOT_GAP_MS));
        }
        // The 404 is down: summon the lasso, crack it twice wide, and on the
        // third throw hook the theme icon and yank it to the ground.
        if (isCurrent(id) && lasso && typeof lasso.sequence === 'function') {
            try {
                await lasso.sequence(() => document.getElementById('theme-toggle'));
            } catch {
                return;
            }
        }

        done = true;
    };

    const onSleepChange = (asleep) => {
        if (reduceMotion.matches) return;
        runId += 1;
        if (!asleep || done) return;
        const id = runId;
        void run(id);
    };

    // Aggressive cursor flee: while sprouted, sprint away from a close mouse
    // and stop the moment it backs off. Driving keeps the figure up, so the
    // shoot sequence survives a scare.
    const updateFlee = () => {
        if (!dot.el.classList.contains('sprouted')) {
            if (fleeing) {
                fleeing = false;
                dot.release();
            }
            return;
        }
        if (mouseX === null || mouseY === null) return;
        const p = dot.pos();
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        if (Math.hypot(dx, dy) < FLEE_RADIUS) {
            const dir = dx >= 0 ? 1 : -1;
            dot.drive(dir * FLEE_SPEED);
            dot.el.classList.toggle('face-left', dir < 0);
            fleeing = true;
        } else if (fleeing) {
            fleeing = false;
            dot.release();
        }
    };

    const start = () => {
        if (started || reduceMotion.matches) return;
        started = true;
        window.addEventListener('mousemove', (event) => {
            mouseX = event.clientX;
            mouseY = event.clientY;
        });
        dot.onStep(updateFlee);
        dot.onSleepChange(onSleepChange);
        if (dot.isAsleep()) onSleepChange(true);
    };

    return {start};
}
