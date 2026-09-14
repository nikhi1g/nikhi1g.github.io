// Fishing rod finale: the creature hooks a piece of the page, hoists it off,
// and flings it down to lie broken on the floor.
//
// Two coordinate systems are at work. The rod lives inside the rig's SVG (it is
// a child of #arm-r, so the arm carries it), but the line and hook have to
// reach elements anywhere on the page, which the rig's 30x74 viewBox cannot
// express. So the line and hook are drawn in a separate full-screen overlay in
// viewport pixels, anchored to the fist via getScreenCTM.

const CAST_MS = 620;      // hand -> target
const DRAW_MS = 220;      // beat once the hook is on
const HOIST_MS = 520;     // target lifted back toward the creature
const ARC_LIFT = 0.42;    // how high the cast bows, as a fraction of the span

const SVG_NS = 'http://www.w3.org/2000/svg';

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
});

const centreOf = (rect) => ({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
});

// Frame-driven tween rather than rAF: a backgrounded tab throttles rAF to a
// standstill, and the sequence must still finish if the page is not visible.
const tween = (duration, onFrame) => new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        onFrame(t);
        if (t < 1) setTimeout(tick, 16);
        else resolve();
    };
    setTimeout(tick, 16);
});

export function createFishing(dot) {
    const creature = dot.el;
    let rod = null;
    let overlay = null;
    let lineEl = null;
    let hookEl = null;

    // The fist, in viewport pixels, so the line starts where the hand is.
    const handPoint = () => {
        const figure = creature.querySelector('.figure');
        try {
            const fore = creature.querySelector('#fore-r');
            if (fore && figure && typeof DOMPoint !== 'undefined') {
                const ctm = fore.getScreenCTM();
                if (ctm) {
                    const p = new DOMPoint(22.5, 38.5).matrixTransform(ctm);
                    if (Number.isFinite(p.x) && Number.isFinite(p.y)) return {x: p.x, y: p.y};
                }
            }
        } catch {
            // Fall through to the torso-based approximation.
        }
        const position = dot.pos();
        const height = figure?.getBoundingClientRect().height || 0;
        const rise = height > 0 ? height * (65.5 - 38.5) / 74 : 25;
        return {x: position.x, y: position.y - rise};
    };

    // Runtime-built rod inside #arm-r, mirroring the axe/saw nested transforms
    // so the arm's own rotation carries it (see tools.css).
    const ensureRod = () => {
        if (rod && rod.isConnected) return rod;
        const armR = creature.querySelector('#arm-r');
        if (!armR) return null;
        const existing = armR.querySelector('#rod');
        if (existing) {
            rod = existing;
            return rod;
        }

        const outer = document.createElementNS(SVG_NS, 'g');
        outer.setAttribute('id', 'rod');
        outer.setAttribute('transform', 'rotate(38 22.5 38.5)');

        const inner = document.createElementNS(SVG_NS, 'g');
        inner.setAttribute('transform', 'translate(11.271042 28.783493) rotate(-41) scale(0.70)');

        const blank = document.createElementNS(SVG_NS, 'path');
        blank.setAttribute('class', 'rod-blank');
        blank.setAttribute('d', 'M3 21 L21 3');

        const tip = document.createElementNS(SVG_NS, 'path');
        tip.setAttribute('class', 'rod-tip');
        tip.setAttribute('d', 'M21 3 L23 1');

        const reel = document.createElementNS(SVG_NS, 'circle');
        reel.setAttribute('class', 'rod-reel');
        reel.setAttribute('cx', '5.5');
        reel.setAttribute('cy', '18.5');
        reel.setAttribute('r', '3');

        const grip = document.createElementNS(SVG_NS, 'path');
        grip.setAttribute('class', 'rod-grip');
        grip.setAttribute('d', 'M3 21 L7 17');

        inner.appendChild(blank);
        inner.appendChild(tip);
        inner.appendChild(reel);
        inner.appendChild(grip);
        outer.appendChild(inner);
        armR.appendChild(outer);
        rod = outer;
        return rod;
    };

    // Full-screen overlay: the line and hook live in viewport pixels.
    const ensureOverlay = () => {
        if (overlay && overlay.isConnected) return overlay;
        overlay = document.createElementNS(SVG_NS, 'svg');
        overlay.setAttribute('class', 'fishing-line-layer');
        overlay.setAttribute('aria-hidden', 'true');
        // Inline: `body` is a flex container and the overlay must never be a
        // flex item, whatever the stylesheet is doing.
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';

        lineEl = document.createElementNS(SVG_NS, 'path');
        lineEl.setAttribute('class', 'fishing-line');
        lineEl.setAttribute('d', '');

        hookEl = document.createElementNS(SVG_NS, 'path');
        hookEl.setAttribute('class', 'fishing-hook');
        hookEl.setAttribute('d', 'M0 -7 L0 3 A4 4 0 0 0 8 3 L8 -1');
        hookEl.setAttribute('transform', 'translate(0 0)');

        overlay.appendChild(lineEl);
        overlay.appendChild(hookEl);
        document.body.appendChild(overlay);
        return overlay;
    };

    const drawLine = (from, to, bow) => {
        if (!lineEl) return;
        // A quadratic control point lifted above the midpoint makes the line
        // bow like a rod under load instead of reading as a straight laser.
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const lift = Math.hypot(to.x - from.x, to.y - from.y) * (bow ?? ARC_LIFT);
        lineEl.setAttribute('d', `M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${midX.toFixed(1)} ${(midY - lift).toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`);
        hookEl.setAttribute('transform', `translate(${to.x.toFixed(1)} ${to.y.toFixed(1)})`);
    };

    const showRod = () => {
        ensureRod();
        ensureOverlay();
        creature.classList.add('fishing');
    };

    const hideRod = () => {
        creature.classList.remove('fishing');
        if (overlay) overlay.classList.remove('is-visible');
        if (lineEl) lineEl.setAttribute('d', '');
    };

    // Turn a live element into fixed-position debris, copying the text metrics
    // so it renders identically once it leaves the page flow.
    const detach = (target) => {
        const rect = target.getBoundingClientRect();
        const style = window.getComputedStyle(target);
        if (style.font) target.style.font = style.font;
        if (style.color) target.style.color = style.color;
        if (style.lineHeight) target.style.lineHeight = style.lineHeight;
        target.style.position = 'fixed';
        target.style.left = `${rect.left}px`;
        target.style.top = `${rect.top}px`;
        target.style.width = `${rect.width}px`;
        target.style.height = `${rect.height}px`;
        target.style.margin = '0';
        target.style.zIndex = '3';
        target.style.pointerEvents = 'none';
        target.classList.add('fish-catch');
        if (target.parentElement !== document.body) document.body.appendChild(target);
        return rect;
    };

    const fishOnce = async (target) => {
        if (!target || !target.isConnected) return false;
        if (target.dataset.fished === '1') return false;
        const startRect = target.getBoundingClientRect();
        if (startRect.width < 1 || startRect.height < 1) return false;
        target.dataset.fished = '1';

        const catchPoint = () => {
            const rect = target.getBoundingClientRect();
            return {x: rect.left + rect.width / 2, y: rect.top - 4};
        };

        try {
            showRod();
            if (overlay) overlay.classList.add('is-visible');
        } catch {
            return false;
        }

        const hand = handPoint();
        const goal = catchPoint();

        if (prefersReducedMotion()) {
            const rect = detach(target);
            dot.spawnDebris(target, rect.left, rect.top, (Math.random() - 0.5) * 40, 60);
            hideRod();
            return true;
        }

        // Cast: the hook arcs out to just above the target.
        await tween(CAST_MS, (t) => {
            const eased = t * t * (3 - 2 * t);
            const from = handPoint();
            const here = catchPoint();
            drawLine(from, {
                x: from.x + (here.x - from.x) * eased,
                y: from.y + (here.y - from.y) * eased - Math.sin(eased * Math.PI) * 26
            });
        });
        drawLine(handPoint(), goal);
        await wait(DRAW_MS);

        // Hoist: the catch leaves the page flow and is reeled up to the fist.
        const rect = detach(target);
        const lifted = {left: rect.left, top: rect.top};
        await tween(HOIST_MS, (t) => {
            const eased = t * t * (3 - 2 * t);
            const from = handPoint();
            lifted.left = rect.left + (from.x - rect.width / 2 - rect.left) * eased;
            lifted.top = rect.top + (from.y - rect.height / 2 - rect.top) * eased;
            target.style.left = `${lifted.left}px`;
            target.style.top = `${lifted.top}px`;
            drawLine(from, {x: lifted.left + rect.width / 2, y: lifted.top + rect.height / 2});
        });

        // Fling: released at the top of the swing so it falls and settles.
        const tip = handPoint();
        hideRod();
        dot.spawnDebris(
            target,
            tip.x - rect.width / 2,
            tip.y - rect.height / 2,
            (Math.random() - 0.5) * 70,
            -60
        );
        return true;
    };

    return {fishOnce, hideRod};
}
