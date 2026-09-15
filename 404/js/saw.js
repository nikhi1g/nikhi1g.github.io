// Circular saw: the creature cuts a target element clean in half.
// Mirrors the house pattern from arrow.js (reduced-motion guard, wait()
// helper) and from creature.js's knockOffLetter (turn a live element into
// fixed-position physics debris by copying its computed text metrics).

const SAW_CUT_MS = 1800;     // one continuous run of the blade
const SPARK_EVERY_MS = 90;   // how often a burst is thrown while cutting
const SPARKS_PER_BURST = 3;
const SPARK_LIFE_MS = 460;

const SVG_NS = 'http://www.w3.org/2000/svg';

// Blade geometry in icon space (24x24, grip anchor at (3,21)). The blade sits
// FORWARD of the fist along +x, which is the rig's facing direction — so the
// tool points wherever the creature is facing and never has to be flipped by
// hand. Getting this wrong is what left it leaning away from its own cut.
const HUB = {x: 15.5, y: 12};
const BLADE_R = 6.4;
const TEETH = 16;
const TOOTH = 1.15;

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
});

const round2 = (value) => Math.round(value * 100) / 100;

// The toothed rim, cut geometrically rather than eyeballed: step around the
// circle and alternate a point at the tooth radius with a gullet at the blade
// radius. Changing TEETH or TOOTH re-cuts it correctly with no other edits.
const rimPath = () => {
    let path = '';
    for (let i = 0; i < TEETH; i += 1) {
        const a0 = (i / TEETH) * Math.PI * 2;
        const a1 = ((i + 0.5) / TEETH) * Math.PI * 2;
        const gullet = {
            x: HUB.x + Math.cos(a0) * BLADE_R,
            y: HUB.y + Math.sin(a0) * BLADE_R
        };
        const crest = {
            x: HUB.x + Math.cos(a1) * (BLADE_R + TOOTH),
            y: HUB.y + Math.sin(a1) * (BLADE_R + TOOTH)
        };
        path += `${i === 0 ? 'M' : 'L'}${round2(gullet.x)} ${round2(gullet.y)}`;
        path += ` L${round2(crest.x)} ${round2(crest.y)}`;
    }
    return `${path} Z`;
};

export function createSaw(dot) {
    const creature = dot.el;
    let sawGroup = null;
    let bladeGroup = null;

    // The saw is a runtime-built SVG group appended inside #arm-r, mirroring
    // 404.html's #axe/#hammer nested-transform trick exactly: the outer g
    // repeats the 38deg grip rotation about the hand (22.5, 38.5), the inner
    // g maps the 24x24 icon's handle anchor onto that same point at the same
    // 0.70 scale. As a child of #arm-r it is carried by every arm rotation
    // for free — see tools.css's comment on why it must stay there.
    //
    // Three levels, and the nesting matters: `outer` and `inner` both carry a
    // transform ATTRIBUTE for the grip, and a CSS transform animation replaces
    // that attribute outright. So the blade's spin lives on its own bare group
    // with no attribute of its own to lose.
    const ensureSaw = () => {
        if (sawGroup && sawGroup.isConnected) return sawGroup;
        const armR = creature.querySelector('#arm-r');
        if (!armR) return null;
        const existing = armR.querySelector('#saw');
        if (existing) {
            sawGroup = existing;
            bladeGroup = existing.querySelector('.saw-spin');
            return sawGroup;
        }

        const outer = document.createElementNS(SVG_NS, 'g');
        outer.setAttribute('id', 'saw');
        outer.setAttribute('transform', 'rotate(38 22.5 38.5)');

        const inner = document.createElementNS(SVG_NS, 'g');
        inner.setAttribute('transform', 'translate(11.271042 28.783493) rotate(-41) scale(0.70)');

        // The motor body, sitting in the fist behind the blade.
        const body = document.createElementNS(SVG_NS, 'path');
        body.setAttribute('class', 'saw-body');
        body.setAttribute('d', 'M2.2 18.4 h6.2 a2.1 2.1 0 0 1 2.1 2.1 v1.8 a2.1 2.1 0 0 1 -2.1 2.1 h-6.2 a2.1 2.1 0 0 1 -2.1 -2.1 v-1.8 a2.1 2.1 0 0 1 2.1 -2.1 z');

        // The arbor: the neck from the motor up to the blade's hub.
        const arbor = document.createElementNS(SVG_NS, 'path');
        arbor.setAttribute('class', 'saw-arbor');
        arbor.setAttribute('d', `M8.6 19.6 L${round2(HUB.x - 1.5)} ${round2(HUB.y + 3.2)}`);

        // The guard, hooding the upper-rear half of the blade.
        const guard = document.createElementNS(SVG_NS, 'path');
        guard.setAttribute('class', 'saw-guard');
        const gr = BLADE_R + 1.5;
        guard.setAttribute('d',
            `M${round2(HUB.x - gr)} ${round2(HUB.y)}`
            + ` A${round2(gr)} ${round2(gr)} 0 0 1 ${round2(HUB.x + gr)} ${round2(HUB.y)}`
        );

        // The blade itself spins: its own group, no transform attribute.
        const spin = document.createElementNS(SVG_NS, 'g');
        spin.setAttribute('class', 'saw-spin');

        const disc = document.createElementNS(SVG_NS, 'circle');
        disc.setAttribute('class', 'saw-disc');
        disc.setAttribute('cx', String(HUB.x));
        disc.setAttribute('cy', String(HUB.y));
        disc.setAttribute('r', String(BLADE_R));

        const rim = document.createElementNS(SVG_NS, 'path');
        rim.setAttribute('class', 'saw-rim');
        rim.setAttribute('d', rimPath());

        // Two spokes, so the spin is actually legible on a plain disc.
        const spokes = document.createElementNS(SVG_NS, 'path');
        spokes.setAttribute('class', 'saw-spokes');
        spokes.setAttribute('d',
            `M${round2(HUB.x - BLADE_R * 0.62)} ${round2(HUB.y)} L${round2(HUB.x + BLADE_R * 0.62)} ${round2(HUB.y)}`
            + ` M${round2(HUB.x)} ${round2(HUB.y - BLADE_R * 0.62)} L${round2(HUB.x)} ${round2(HUB.y + BLADE_R * 0.62)}`
        );

        const hub = document.createElementNS(SVG_NS, 'circle');
        hub.setAttribute('class', 'saw-hub');
        hub.setAttribute('cx', String(HUB.x));
        hub.setAttribute('cy', String(HUB.y));
        hub.setAttribute('r', '1.3');

        spin.appendChild(disc);
        spin.appendChild(rim);
        spin.appendChild(spokes);

        inner.appendChild(arbor);
        inner.appendChild(spin);
        inner.appendChild(guard);
        inner.appendChild(body);
        inner.appendChild(hub);
        outer.appendChild(inner);
        armR.appendChild(outer);

        sawGroup = outer;
        bladeGroup = spin;
        return sawGroup;
    };

    // Where the blade actually is on screen, in viewport pixels. The split and
    // the sparks both come off this, so the cut lands under the blade rather
    // than wherever the body happens to be standing.
    const bladePoint = () => {
        const source = bladeGroup && bladeGroup.isConnected ? bladeGroup : sawGroup;
        const box = source && typeof source.getBoundingClientRect === 'function'
            ? source.getBoundingClientRect()
            : null;
        if (!box || (box.width < 1 && box.height < 1)) return null;
        return {x: box.left + box.width / 2, y: box.top + box.height / 2};
    };

    // Sparks fly off the contact point: thrown outward and up, then falling,
    // and each removes itself when its animation ends so nothing accumulates.
    const throwSparks = (at) => {
        for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
            const spark = document.createElement('span');
            spark.className = 'saw-spark';
            spark.setAttribute('aria-hidden', 'true');
            const angle = (-140 + Math.random() * 100) * Math.PI / 180;
            const reach = 14 + Math.random() * 22;
            spark.style.left = `${at.x}px`;
            spark.style.top = `${at.y}px`;
            spark.style.setProperty('--fly-x', `${Math.cos(angle) * reach}px`);
            spark.style.setProperty('--fly-y', `${Math.sin(angle) * reach}px`);
            spark.style.setProperty('--fall-y', `${18 + Math.random() * 20}px`);
            spark.style.animationDuration = `${SPARK_LIFE_MS}ms`;
            spark.addEventListener('animationend', () => spark.remove(), {once: true});
            document.body.appendChild(spark);
            // Belt and braces: if the animation never fires (a hidden tab, say)
            // the spark still goes away rather than lingering on the page.
            setTimeout(() => spark.remove(), SPARK_LIFE_MS + 400);
        }
    };

    // Splits `target` in two at `fraction` of its width. Mirrors creature.js's
    // knockOffLetter: copy the computed font/color/line-height onto
    // fixed-position clones so the text renders identically, hide the original
    // in place (visibility: hidden keeps its layout box so nothing reflows),
    // then hand both halves to the physics debris system with opposite
    // horizontal velocity and spin so they topple apart.
    const splitInHalf = (target, rect, fraction) => {
        const style = window.getComputedStyle(target);
        const font = style.font;
        const color = style.color;
        const lineHeight = style.lineHeight;
        const baseClass = (target.getAttribute('class') || '').trim();
        const cut = Math.min(85, Math.max(15, fraction * 100));

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

        const left = makeHalf(`inset(0 ${round2(100 - cut)}% 0 0)`);
        const right = makeHalf(`inset(0 0 0 ${round2(cut)}%)`);
        document.body.appendChild(left);
        document.body.appendChild(right);

        target.style.visibility = 'hidden';

        const speed = 90 + Math.random() * 60;
        const lift = -70 - Math.random() * 50;
        dot.spawnDebris(left, rect.left, rect.top, -speed, lift, -(140 + Math.random() * 140));
        dot.spawnDebris(right, rect.left, rect.top, speed, lift, 140 + Math.random() * 140);

        return true;
    };

    // async (HTMLElement) => boolean. Shows the saw, spins it through the
    // target throwing sparks, then splits it where the blade actually was.
    // Returns false — never throws — for a missing/zero-size/already-sawn
    // target or if the rig has no #arm-r to hang the saw from.
    const sawThrough = async (target) => {
        let sparkTimer = null;
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
            let fraction = 0.5;
            if (!prefersReducedMotion()) {
                // Sparks come off where the blade meets the text, so they track
                // the blade rather than sitting at a fixed point.
                sparkTimer = setInterval(() => {
                    const blade = bladePoint();
                    if (blade) throwSparks({x: blade.x, y: rect.top + rect.height / 2});
                }, SPARK_EVERY_MS);
                await wait(SAW_CUT_MS);
                clearInterval(sparkTimer);
                sparkTimer = null;
                const blade = bladePoint();
                if (blade) fraction = (blade.x - rect.left) / rect.width;
            }
            creature.classList.remove('sawing');

            return splitInHalf(target, rect, fraction);
        } catch (e) {
            void e;
            clearInterval(sparkTimer);
            creature.classList.remove('sawing');
            return false;
        }
    };

    return {sawThrough};
}
