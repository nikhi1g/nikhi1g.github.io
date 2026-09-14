import {glassHole} from './glass.js';

export function createCreature({dot, arrow}) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Every destructive act is separated by a beat: the creature sizes up the
    // next target instead of machine-gunning the page apart.
    const BEAT_MIN_MS = 1000;
    const BEAT_MAX_MS = 2000;
    const beat = () => new Promise((resolve) => {
        setTimeout(resolve, BEAT_MIN_MS + Math.random() * (BEAT_MAX_MS - BEAT_MIN_MS));
    });
    const FLEE_RADIUS = 170;
    const FLEE_SPEED = 170;

    let started = false;
    let volleyDone = false;
    let finaleDone = false;
    let finaleTries = 0;
    let pryDone = false;
    let pryTries = 0;
    let runId = 0;
    let lastKick = 0;
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

        document.body.appendChild(letter);
        const vx = impact && Number.isFinite(impact.vx)
            ? impact.vx * 0.18 + (Math.random() - 0.5) * 60
            : (Math.random() - 0.5) * 80;
        const vy = impact && Number.isFinite(impact.vy)
            ? -140 + impact.vy * 0.08
            : -140;
        dot.spawnDebris(letter, rect.left, rect.top, vx, vy, (Math.random() - 0.5) * 120);
    };

    // Axe finale: one spinning throw at the theme icon. The fracture decal
    // takes the icon's socket and the icon itself drops under real gravity.
    const knockOffIcon = (impact) => {
        const icon = document.getElementById('theme-toggle');
        if (!icon || !icon.isConnected) return;
        const rect = icon.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        if (!icon.dataset.yanked && !document.querySelector('.glass-hole')) {
            // The socket has to hold the icon's exact slot. The toggle is
            // pushed right by `margin-left: auto`, so copy the resolved
            // margins before the icon leaves the flow or the decal packs left.
            const iconStyle = window.getComputedStyle(icon);
            const hole = document.createElement('span');
            hole.className = 'glass-hole';
            hole.setAttribute('aria-hidden', 'true');
            hole.style.width = `${rect.width}px`;
            hole.style.height = `${rect.height}px`;
            hole.style.marginLeft = iconStyle.marginLeft;
            hole.style.marginRight = iconStyle.marginRight;
            hole.style.marginTop = iconStyle.marginTop;
            hole.style.marginBottom = iconStyle.marginBottom;
            hole.innerHTML = glassHole(Math.round(rect.width), Math.round(rect.height));
            icon.parentElement.insertBefore(hole, icon);
            icon.dataset.yanked = '1';
        }
        icon.style.position = 'fixed';
        icon.style.left = `${rect.left}px`;
        icon.style.top = `${rect.top}px`;
        icon.style.width = `${rect.width}px`;
        icon.style.height = `${rect.height}px`;
        icon.style.margin = '0';
        icon.style.zIndex = '5';
        icon.style.pointerEvents = 'none';
        document.body.appendChild(icon);
        const vx = impact && Number.isFinite(impact.vx)
            ? impact.vx * 0.1 + (Math.random() - 0.5) * 40
            : (Math.random() - 0.5) * 60;
        dot.spawnDebris(icon, rect.left, rect.top, vx, 80);
    };

    // The lever: a stand-in rule element takes the footer's top border, tilts
    // up off its far end while the creature leans, then tears free as debris.
    const pryRule = async () => {
        const footer = document.querySelector('footer');
        if (!footer || footer.classList.contains('rule-gone')) return;
        const rect = footer.getBoundingClientRect();
        if (rect.width < 1) return;

        const bar = document.createElement('span');
        bar.className = 'pried-rule';
        bar.setAttribute('aria-hidden', 'true');
        bar.style.left = `${rect.left}px`;
        bar.style.top = `${rect.top}px`;
        bar.style.width = `${rect.width}px`;
        document.body.appendChild(bar);
        // The real border hands over to the stand-in on the same frame.
        footer.classList.add('rule-gone');

        const dir = dot.pos().x > rect.left + rect.width / 2 ? 1 : -1;
        bar.style.transformOrigin = dir > 0 ? '0% 50%' : '100% 50%';
        dot.el.classList.add('prying');
        dot.el.classList.toggle('face-left', dir < 0);

        // Load the lever, hold, then let it tear.
        await new Promise((r) => setTimeout(r, 260));
        bar.classList.add('is-levering');
        await new Promise((r) => setTimeout(r, 520));

        dot.el.classList.remove('prying');
        const torn = bar.getBoundingClientRect();
        bar.classList.remove('is-levering');
        bar.style.transition = 'none';
        dot.dropLine();
        dot.spawnDebris(bar, torn.left, torn.top, dir * -60, -90, dir * -140);
    };

    const run = async (id) => {
        const ready = await waitForSprouted(id);
        if (!ready || !isCurrent(id)) return;

        // Phase 1: three arrows into the heading. A wake aborts the loop, but
        // the next sleep resumes on whatever letters are still standing.
        if (!volleyDone) {
            if (!arrow || typeof arrow.fire !== 'function') return;
            const letters = splitHeading();
            await beat();
            for (const letter of letters) {
                if (!isCurrent(id)) return;
                if (!dot.isAsleep()) return;
                if (!letter.isConnected) continue;
                const rect = letter.getBoundingClientRect();
                if (!rect || rect.width < 1 || rect.height < 1) continue;
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
                await beat();
            }
            // DOM truth, not run freshness: no standing letters means done.
            if (splitHeading().length === 0) volleyDone = true;
            else if (isCurrent(id)) volleyDone = true;
            else return;
        }

        // Phase 2: one spinning axe at the theme icon. Same deterministic
        // shape as the arrows: the throw resolves on impact, then the icon
        // drops as debris and the fracture stays behind.
        if (volleyDone && !finaleDone && arrow && typeof arrow.fireAxe === 'function' && finaleTries < 3) {
            finaleTries += 1;
            const icon = document.getElementById('theme-toggle');
            if (!icon || !icon.isConnected) {
                finaleDone = true;
            } else {
                const rect = icon.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) {
                    finaleDone = true;
                } else {
                    let impact = null;
                    await beat();
                    try {
                        impact = await arrow.fireAxe(rect);
                    } catch {
                        if (finaleTries >= 3) finaleDone = true;
                        return;
                    }
                    try {
                        knockOffIcon(impact);
                    } catch {
                        // The throw landed; a fumbled knock still ends the show.
                    }
                    finaleDone = true;
                }
            }
        }

        // Phase 3: pry the footer rule off. No projectile — the creature
        // plants the axe handle under the rule and leans on it, so the rule
        // levers up at one end, tears free, and falls. It was a walkable
        // surface, so the page loses a floor for good.
        if (finaleDone && !pryDone && pryTries < 3) {
            pryTries += 1;
            await beat();
            try {
                await pryRule();
            } catch {
                if (pryTries >= 3) pryDone = true;
                return;
            }
            pryDone = true;
        }
    };

    const onSleepChange = (asleep) => {
        if (reduceMotion.matches) return;
        runId += 1;
        if (!asleep || (volleyDone && finaleDone && pryDone)) return;
        const id = runId;
        lastKick = performance.now();
        void run(id);
    };

    // Aggressive cursor flee: while sprouted, sprint away from a close mouse
    // and stop the moment it backs off. Driving keeps the figure up, so the
    // sequence survives a scare.
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
        // Watchdog: sleep events are the normal trigger, but a wake at the
        // wrong instant can strand a finished phase with no future event to
        // resume on. Re-kick while settled and incomplete.
        const kickTimer = setInterval(() => {
            if (volleyDone && finaleDone && pryDone) {
                clearInterval(kickTimer);
                return;
            }
            if (reduceMotion.matches) return;
            if (!dot.isAsleep() || !dot.el.classList.contains('sprouted')) return;
            if (performance.now() - lastKick < 3000) return;
            lastKick = performance.now();
            runId += 1;
            void run(runId);
        }, 2000);
        if (dot.isAsleep()) onSleepChange(true);
    };

    return {start};
}
