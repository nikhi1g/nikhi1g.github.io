// Verlet-rope lasso summoned from the creature's right hand.
// Technique: classic verlet integration (current/previous positions, no stored
// velocity) with iterative distance-constraint relaxation — the standard
// approach for interactive ropes, whips, and lassos (see code4fukui/physics-rope
// and cedarcantab's verlet rope write-up). Rendered as an SVG polyline so the
// rope keeps the site's stroke aesthetic and can swing outside the card.
const SEGMENTS = 26;
const SEG_LEN = 14;
const ROPE_GRAVITY = 1400;
const ROPE_DAMPING = 0.985;
const RELAXATIONS = 12;
const TIP_PULL = 0.35;
const HOOK_DISTANCE = 16;

const RIG_HEIGHT = 74;
const FEET_Y = 65.5;
const HAND_Y = 38.5;
const FALLBACK_HAND_RISE = 25;

const SVG_NS = 'http://www.w3.org/2000/svg';

const reduceMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
});

const centreOf = (rect) => ({
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2
});

// Procedural impact cracks: jagged radial rays plus two staggered concentric
// rings around a dark punched-out chip. Regenerated per load, so every yank
// leaves a unique fracture.
const crackDecal = (w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.max(w, h) * 0.85;
    const jag = (r, a) => {
        const jitter = 0.82 + Math.random() * 0.36;
        return `${(cx + Math.cos(a) * r * jitter).toFixed(1)},${(cy + Math.sin(a) * r * jitter).toFixed(1)}`;
    };

    let inner = '';
    const rays = 10 + Math.floor(Math.random() * 3);
    for (let i = 0; i < rays; i += 1) {
        const a = (i / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const pts = [`${cx.toFixed(1)},${cy.toFixed(1)}`];
        const steps = 3;
        for (let s = 1; s <= steps; s += 1) {
            pts.push(jag((maxR * s) / steps, a + (Math.random() - 0.5) * 0.22));
        }
        inner += `<polyline class="glass-hole__crack" points="${pts.join(' ')}"></polyline>`;
    }
    for (const ringR of [maxR * 0.38, maxR * 0.68]) {
        const pts = [];
        const n = 14;
        for (let i = 0; i <= n; i += 1) {
            pts.push(jag(ringR, (i / n) * Math.PI * 2));
        }
        inner += `<polygon class="glass-hole__crack" points="${pts.join(' ')}"></polygon>`;
    }
    const chipR = Math.max(2.5, Math.min(w, h) * 0.16);
    inner += `<circle class="glass-hole__chip" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${chipR.toFixed(1)}"></circle>`;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${inner}</svg>`;
};

export function createLasso(dot) {
    const creature = dot.el;
    let svg = null;
    let ropeEl = null;
    let loopEl = null;
    let pts = [];
    let live = false;
    let tipTarget = null;
    let hooked = null;
    let prevTip = null;

    // The rope leaves from the right fist: the tip of #fore-r in screen space,
    // including whatever the arm pose is doing, with a torso-based fallback.
    const handPosition = () => {
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
        } catch (e) {
            void e;
        }
        const position = dot.pos();
        const renderedHeight = figure?.getBoundingClientRect().height || 0;
        const handRise = renderedHeight > 0
            ? renderedHeight * (FEET_Y - HAND_Y) / RIG_HEIGHT
            : FALLBACK_HAND_RISE;
        return {x: position.x, y: position.y - handRise};
    };

    const ensureOverlay = () => {
        if (svg) return svg;
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'bone-lasso');
        svg.setAttribute('aria-hidden', 'true');
        ropeEl = document.createElementNS(SVG_NS, 'polyline');
        ropeEl.setAttribute('class', 'bone-lasso__rope');
        ropeEl.setAttribute('points', '');
        loopEl = document.createElementNS(SVG_NS, 'ellipse');
        loopEl.setAttribute('class', 'bone-lasso__loop');
        loopEl.setAttribute('rx', '5');
        loopEl.setAttribute('ry', '9');
        svg.appendChild(ropeEl);
        svg.appendChild(loopEl);
        document.body.appendChild(svg);
        return svg;
    };

    const render = () => {
        if (!svg) return;
        let str = '';
        for (const p of pts) str += `${p.x.toFixed(1)},${p.y.toFixed(1)} `;
        ropeEl.setAttribute('points', str);
        const tip = pts[pts.length - 1];
        const prev = pts[pts.length - 2] || pts[0];
        const speed = prevTip ? Math.hypot(tip.x - prevTip.x, tip.y - prevTip.y) : 0;
        prevTip = {x: tip.x, y: tip.y};
        const open = Math.max(4, Math.min(16, 4 + speed * 0.06));
        loopEl.setAttribute('cx', tip.x.toFixed(1));
        loopEl.setAttribute('cy', tip.y.toFixed(1));
        loopEl.setAttribute('rx', open.toFixed(1));
        loopEl.setAttribute('ry', (open * 1.8).toFixed(1));
        const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180 / Math.PI;
        loopEl.setAttribute('transform', `rotate(${ang.toFixed(1)} ${tip.x.toFixed(1)} ${tip.y.toFixed(1)})`);
    };

    const solvePair = (a, b, aPinned) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const corr = (d - SEG_LEN) / d;
        if (aPinned) {
            b.x -= dx * corr;
            b.y -= dy * corr;
        } else {
            const f = corr * 0.5;
            a.x += dx * f;
            a.y += dy * f;
            b.x -= dx * f;
            b.y -= dy * f;
        }
    };

    // A fixed coil can't hook a far icon: grow segments until the tip can
    // physically reach the target plus slack, so the loop always arrives.
    const MAX_SEGMENTS = 64;
    const ensureReach = (target, slack = 90) => {
        if (pts.length === 0) return;
        const h = handPosition();
        const need = Math.hypot(target.x - h.x, target.y - h.y) + slack;
        let guard = 0;
        while (pts.length - 1 < MAX_SEGMENTS
            && (pts.length - 1) * SEG_LEN < need
            && guard++ < 64) {
            const tip = pts[pts.length - 1];
            pts.push({x: tip.x, y: tip.y, ox: tip.x, oy: tip.y});
        }
    };

    // Cinch only on real contact: resolve when the tip touches the point.
    const waitForTipNear = (point, ms) => new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
            const tip = pts[pts.length - 1];
            if (!tip || Math.hypot(tip.x - point.x, tip.y - point.y) <= HOOK_DISTANCE
                || performance.now() - start > ms) resolve();
            else setTimeout(tick, 30);
        };
        setTimeout(tick, 30);
    });

    const step = (dt) => {
        if (!live || pts.length === 0) return;
        const frame = Math.max(0.001, Math.min(dt, 1 / 30));
        const h = handPosition();
        const head = pts[0];
        head.x = h.x;
        head.y = h.y;
        head.ox = h.x;
        head.oy = h.y;

        for (let i = 1; i < pts.length; i += 1) {
            const p = pts[i];
            const vx = (p.x - p.ox) * ROPE_DAMPING;
            const vy = (p.y - p.oy) * ROPE_DAMPING;
            p.ox = p.x;
            p.oy = p.y;
            p.x += vx;
            p.y += vy + ROPE_GRAVITY * frame * frame;
        }

        if (hooked) {
            const r = hooked.getBoundingClientRect();
            tipTarget = {x: r.left + r.width / 2, y: r.top + r.height / 2};
        }
        if (tipTarget) {
            const tip = pts[pts.length - 1];
            tip.x += (tipTarget.x - tip.x) * TIP_PULL;
            tip.y += (tipTarget.y - tip.y) * TIP_PULL;
        }

        for (let k = 0; k < RELAXATIONS; k += 1) {
            pts[0].x = h.x;
            pts[0].y = h.y;
            for (let i = 0; i < pts.length - 1; i += 1) {
                solvePair(pts[i], pts[i + 1], i === 0);
            }
        }
        render();
    };

    // setTimeout-driven (not rAF): background-tab throttling only slows the
    // choreography instead of freezing it mid-whip.
    const trackTipTo = (to, seconds) => new Promise((resolve) => {
        const from = tipTarget
            ? {...tipTarget}
            : (() => {
                const tip = pts[pts.length - 1];
                return {x: tip.x, y: tip.y};
            })();
        const start = performance.now();
        const tick = () => {
            const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
            const eased = t * t * (3 - 2 * t);
            tipTarget = {
                x: from.x + (to.x - from.x) * eased,
                y: from.y + (to.y - from.y) * eased
            };
            if (t < 1) setTimeout(tick, 16);
            else resolve();
        };
        setTimeout(tick, 16);
    });

    const summon = async () => {
        if (reduceMotion()) return false;
        ensureOverlay();
        const h = handPosition();
        pts = [];
        for (let i = 0; i <= SEGMENTS; i += 1) {
            pts.push({x: h.x, y: h.y, ox: h.x, oy: h.y});
        }
        prevTip = null;
        tipTarget = {...h};
        hooked = null;
        live = true;
        svg.classList.add('is-visible');
        render();
        await wait(600);
        return true;
    };

    // One whip crack: fling the loop out past the target, then snap it home.
    // Targets deliberately leave the card so the lash travels outside the box.
    const crack = async (target) => {
        ensureReach(target, 60);
        const h = handPosition();
        await trackTipTo(target, 0.3);
        await wait(60);
        await trackTipTo({x: h.x, y: h.y + 20}, 0.3);
    };

    const yankIcon = async (getIcon) => {
        if (!icon || !icon.isConnected) return false;
        const rect = icon.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;

        // The socket left behind: a same-size fracture decal holding the layout.
        const hole = document.createElement('span');
        hole.className = 'glass-hole';
        hole.setAttribute('aria-hidden', 'true');
        hole.style.width = `${rect.width}px`;
        hole.style.height = `${rect.height}px`;
        hole.innerHTML = crackDecal(Math.round(rect.width), Math.round(rect.height));
        icon.parentElement.insertBefore(hole, icon);

        icon.style.position = 'fixed';
        icon.style.left = `${rect.left}px`;
        icon.style.top = `${rect.top}px`;
        icon.style.width = `${rect.width}px`;
        icon.style.height = `${rect.height}px`;
        icon.style.margin = '0';
        icon.style.zIndex = '5';
        icon.style.pointerEvents = 'none';
        document.body.appendChild(icon);
        // Third throw: the loop sails to the icon and cinches on contact —
        // never on a timer — then the pull starts from a true hook.
        ensureReach(centreOf(rect), 110);
        await trackTipTo(centreOf(rect), 0.45);
        await waitForTipNear(centreOf(icon.getBoundingClientRect()), 1500);
        hooked = icon;

        // Yank: haul it down toward the creature on an accelerating pull.
        const pullMs = 550;
        const pullStart = performance.now();
        const from = centreOf(icon.getBoundingClientRect());
        await new Promise((resolve) => {
            const tick = () => {
                const t = Math.min(1, (performance.now() - pullStart) / pullMs);
                const eased = t * t;
                const goal = handPosition();
                goal.y += 70;
                const x = from.x + (goal.x - from.x) * eased;
                const y = from.y + (goal.y - from.y) * eased;
                const r = icon.getBoundingClientRect();
                if (t < 1) setTimeout(tick, 16);
                else resolve();
            };
            setTimeout(tick, 16);
        });

        // Let go: the icon drops under real gravity and bounces until still.
        const end = icon.getBoundingClientRect();
        const tip = pts[pts.length - 1];
        const vx = (tip.x - (prevTip?.x ?? tip.x)) * 12;
        hooked = null;
        dot.spawnDebris(icon, end.left, end.top, vx * 0.4, 120);
        tipTarget = handPosition();
        await wait(450);
        tipTarget = null;
        live = false;
        if (svg) svg.classList.remove('is-visible');
        return true;
    };

    const sequence = async (getIcon) => {
        if (reduceMotion()) return false;
        const ok = await summon();
        if (!ok) return false;
        const h = handPosition();
        await crack({x: h.x + 250, y: h.y - 190});
        const h2 = handPosition();
        await crack({x: h2.x - 250, y: h2.y - 190});
        return yankIcon(getIcon);
    };

    dot.onStep(step);

    return {summon, crack, yankIcon, sequence};
}
