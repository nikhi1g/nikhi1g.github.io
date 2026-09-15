// Hand saw finale tool: the creature saws a target element clean in half.
// Mirrors the house pattern from arrow.js (reduced-motion guard, wait()
// helper) and from creature.js's knockOffLetter (turn a live element into
// fixed-position physics debris by copying its computed text metrics).

const SAW_CUT_MS = 1800;     // one continuous run of strokes

const SVG_NS = 'http://www.w3.org/2000/svg';

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
});

export function createSaw(dot) {
    const creature = dot.el;
    let sawGroup = null;

    // The saw is a runtime-built SVG group appended inside #arm-r, mirroring
    // 404.html's #axe/#hammer nested-transform trick exactly: the outer g
    // repeats the 38deg grip rotation about the hand (22.5, 38.5), the inner
    // g maps the 24x24 icon's handle anchor onto that same point at the same
    // 0.70 scale. As a child of #arm-r it is carried by every arm rotation
    // for free — see tools.css's comment on why it must stay there.

    // The blade, in icon space. A hand saw's plate is a long triangle: deep at
    // the heel, tapering to the toe. Only the spine (the stiff back edge) and
    // the two depths are authored — the toothed edge is derived from them, so
    // the plate cannot be drawn inconsistently with its own teeth.
    //
    // The depths matter: the plate must stay well deeper than its own stroke
    // width, or the outline floods the interior and the saw reads as a solid
    // dark wedge instead of a blade.
    const HEEL_SPINE = {x: 6.5, y: 17.4};
    const TOE_SPINE = {x: 21.4, y: 5.9};
    const HEEL_DEPTH = 4.6;
    const TOE_DEPTH = 1.9;
    const TEETH = 10;
    const TOOTH_DEPTH = 0.8;

    // Path coordinates are rounded so the emitted `d` stays readable.
    const round2 = (value) => Math.round(value * 100) / 100;

    // Blade axis, and the outward normal the teeth bite along.
    const axis = () => {
        const run = {x: TOE_SPINE.x - HEEL_SPINE.x, y: TOE_SPINE.y - HEEL_SPINE.y};
        const length = Math.hypot(run.x, run.y);
        const unit = {x: run.x / length, y: run.y / length};
        return {length, unit, normal: {x: -unit.y, y: unit.x}};
    };

    const HEEL_EDGE = (() => {
        const {normal} = axis();
        return {x: HEEL_SPINE.x + normal.x * HEEL_DEPTH, y: HEEL_SPINE.y + normal.y * HEEL_DEPTH};
    })();
    const TOE_EDGE = (() => {
        const {normal} = axis();
        return {x: TOE_SPINE.x + normal.x * TOE_DEPTH, y: TOE_SPINE.y + normal.y * TOE_DEPTH};
    })();

    // A real saw is defined by its teeth, so they are cut geometrically rather
    // than eyeballed: walk the toothed edge in equal steps and alternate tip
    // and gullet, each tip displaced along the edge's outward normal. Changing
    // TEETH or TOOTH_DEPTH re-cuts them correctly with no other edits.
    const toothPath = () => {
        const run = {x: TOE_EDGE.x - HEEL_EDGE.x, y: TOE_EDGE.y - HEEL_EDGE.y};
        const length = Math.hypot(run.x, run.y);
        const unit = {x: run.x / length, y: run.y / length};
        // Outward normal: the teeth bite away from the spine.
        const normal = {x: -unit.y, y: unit.x};
        const step = length / TEETH;
        const along = (distance) => ({
            x: HEEL_EDGE.x + unit.x * distance,
            y: HEEL_EDGE.y + unit.y * distance
        });
        let path = `M${round2(HEEL_EDGE.x)} ${round2(HEEL_EDGE.y)}`;
        for (let tooth = 0; tooth < TEETH; tooth += 1) {
            const crest = along((tooth + 0.5) * step);
            const gullet = along((tooth + 1) * step);
            path += ` L${round2(crest.x + normal.x * TOOTH_DEPTH)} ${round2(crest.y + normal.y * TOOTH_DEPTH)}`;
            path += ` L${round2(gullet.x)} ${round2(gullet.y)}`;
        }
        return path;
    };

    const ensureSaw = () => {
        if (sawGroup && sawGroup.isConnected) return sawGroup;
        const armR = creature.querySelector('#arm-r');
        if (!armR) return null;
        const existing = armR.querySelector('#saw');
        if (existing) {
            sawGroup = existing;
            return sawGroup;
        }

        const outer = document.createElementNS(SVG_NS, 'g');
        outer.setAttribute('id', 'saw');
        outer.setAttribute('transform', 'rotate(38 22.5 38.5)');

        // The cutting stroke lives on this bare wrapper: `outer` and `inner`
        // both carry a `transform` attribute for the grip, and a CSS transform
        // animation would replace that attribute outright and lose the grip.
        const stroke = document.createElementNS(SVG_NS, 'g');
        stroke.setAttribute('class', 'saw-stroke');

        const inner = document.createElementNS(SVG_NS, 'g');
        inner.setAttribute('transform', 'translate(11.271042 28.783493) rotate(-41) scale(0.70)');

        // Hand saw, authored at 24x24 with the grip anchor at (3,21) so the
        // nested transform puts the handle in the fist and the blade out ahead
        // of it. Read heel-to-toe: closed D-handle, blade plate, toothed edge.
        const blade = document.createElementNS(SVG_NS, 'path');
        blade.setAttribute('class', 'saw-blade');
        blade.setAttribute('d',
            `M${round2(HEEL_SPINE.x)} ${round2(HEEL_SPINE.y)} L${round2(TOE_SPINE.x)} ${round2(TOE_SPINE.y)}`
            + ` L${round2(TOE_EDGE.x)} ${round2(TOE_EDGE.y)} L${round2(HEEL_EDGE.x)} ${round2(HEEL_EDGE.y)} Z`
        );

        const teeth = document.createElementNS(SVG_NS, 'path');
        teeth.setAttribute('class', 'saw-teeth');
        teeth.setAttribute('d', toothPath());

        // The closed D-handle at the heel. Two subpaths with evenodd fill: the
        // outer grip and the hole the fingers actually pass through, which is
        // centred on the grip anchor (3,21) so the fist lands inside it.
        const handle = document.createElementNS(SVG_NS, 'path');
        handle.setAttribute('class', 'saw-handle');
        handle.setAttribute('fill-rule', 'evenodd');
        handle.setAttribute('d',
            `M${round2(HEEL_SPINE.x)} ${round2(HEEL_SPINE.y)} L2.6 19.5 Q1.1 21.3 1.9 23.5`
            + ` Q2.9 25.6 6.0 24.6 L${round2(HEEL_EDGE.x)} ${round2(HEEL_EDGE.y)} Z`
            + ' M5.5 20.0 Q3.3 21.0 3.5 22.6 Q3.9 23.8 5.9 23.0 Z'
        );

        // The spine is doubled up so the back of the blade reads as the thick,
        // rigid edge it is — that asymmetry is what makes it a saw and not a
        // knife at this size.
        const spine = document.createElementNS(SVG_NS, 'path');
        spine.setAttribute('class', 'saw-spine');
        spine.setAttribute('d', `M${HEEL_SPINE.x} ${HEEL_SPINE.y} L${TOE_SPINE.x} ${TOE_SPINE.y}`);

        inner.appendChild(blade);
        inner.appendChild(teeth);
        inner.appendChild(spine);
        inner.appendChild(handle);
        stroke.appendChild(inner);
        outer.appendChild(stroke);
        armR.appendChild(outer);

        sawGroup = outer;
        return sawGroup;
    };

    // Splits `target` into independently falling left/right halves. Mirrors
    // creature.js's knockOffLetter: copy the computed font/color/line-height
    // onto fixed-position clones so the text renders identically, hide the
    // original in place (visibility: hidden keeps its layout box so nothing
    // reflows), then hand both halves to the physics debris system with
    // opposite horizontal velocity and spin so they topple apart.
    const splitInHalf = (target, rect) => {
        const style = window.getComputedStyle(target);
        const font = style.font;
        const color = style.color;
        const lineHeight = style.lineHeight;
        const baseClass = (target.getAttribute('class') || '').trim();

        const makeHalf = (clip) => {
            const half = target.cloneNode(true);
            half.removeAttribute('id');
            half.setAttribute('class', `${baseClass} saw-half`.trim());
            half.style.position = 'fixed';
            half.style.left = `${rect.left}px`;
            half.style.top = `${rect.top}px`;
            half.style.width = `${rect.width}px`;
            half.style.height = `${rect.height}px`;
            half.style.margin = '0';
            half.style.font = font;
            half.style.color = color;
            half.style.lineHeight = lineHeight;
            half.style.clipPath = clip;
            return half;
        };

        const left = makeHalf('inset(0 50% 0 0)');
        const right = makeHalf('inset(0 0 0 50%)');
        document.body.appendChild(left);
        document.body.appendChild(right);

        target.style.visibility = 'hidden';

        const speed = 90 + Math.random() * 60;
        const lift = -70 - Math.random() * 50;
        dot.spawnDebris(left, rect.left, rect.top, -speed, lift, -(140 + Math.random() * 140));
        dot.spawnDebris(right, rect.left, rect.top, speed, lift, 140 + Math.random() * 140);

        return true;
    };

    // async (HTMLElement) => boolean. Shows the saw, runs a reciprocating
    // sawing animation (CSS-driven, not rAF), then splits `target` in half.
    // Returns false — never throws — for a missing/zero-size/already-sawn
    // target or if the rig has no #arm-r to hang the saw from.
    const sawThrough = async (target) => {
        try {
            if (!target || typeof target.getBoundingClientRect !== 'function' || !target.isConnected) {
                return false;
            }
            if (target.dataset && target.dataset.sawn) return false;
            const rect = target.getBoundingClientRect();
            if (!rect || rect.width < 1 || rect.height < 1) return false;

            if (!ensureSaw()) return false;
            if (target.dataset) target.dataset.sawn = '1';

            creature.classList.add('sawing');
            if (!prefersReducedMotion()) {
                await wait(SAW_CUT_MS);
            }
            creature.classList.remove('sawing');

            return splitInHalf(target, rect);
        } catch (e) {
            void e;
            creature.classList.remove('sawing');
            return false;
        }
    };

    return {sawThrough};
}
