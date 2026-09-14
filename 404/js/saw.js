// Hand saw finale tool: the creature saws a target element clean in half.
// Mirrors the house pattern from arrow.js (reduced-motion guard, wait()
// helper) and from creature.js's knockOffLetter (turn a live element into
// fixed-position physics debris by copying its computed text metrics).

const SAW_CUT_MS = 1800;     // one continuous chainsaw cut

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

        // The engine judder lives on this bare wrapper: `outer` and `inner` both
        // carry a `transform` attribute for the grip, and a CSS transform
        // animation would replace that attribute outright and lose the grip.
        const jitter = document.createElementNS(SVG_NS, 'g');
        jitter.setAttribute('class', 'chainsaw-jitter');

        const inner = document.createElementNS(SVG_NS, 'g');
        inner.setAttribute('transform', 'translate(11.271042 28.783493) rotate(-41) scale(0.70)');

        // Chainsaw, authored at 24x24 with the grip anchor at (3,21) so the
        // nested transform puts the power head in the fist and the bar out
        // ahead of it. Read left-to-right: rear handle, power head with a top
        // handle, then the guide bar.
        const body = document.createElementNS(SVG_NS, 'path');
        body.setAttribute('class', 'chainsaw-body');
        body.setAttribute('d', 'M1.4 15.6 h6.4 a2.2 2.2 0 0 1 2.2 2.2 v1.6 a2.2 2.2 0 0 1 -2.2 2.2 h-6.4 a2.2 2.2 0 0 1 -2.2 -2.2 v-1.6 a2.2 2.2 0 0 1 2.2 -2.2 z');

        const topHandle = document.createElementNS(SVG_NS, 'path');
        topHandle.setAttribute('class', 'chainsaw-handle');
        topHandle.setAttribute('d', 'M1.8 15.6 q3.2 -3.8 6.6 -0.5');

        const rearHandle = document.createElementNS(SVG_NS, 'path');
        rearHandle.setAttribute('class', 'chainsaw-handle');
        rearHandle.setAttribute('d', 'M-1.6 17.4 q-2.6 0.6 -2.2 3.1');

        // The guide bar: a closed loop so the chain can run around it.
        const bar = document.createElementNS(SVG_NS, 'path');
        bar.setAttribute('class', 'chainsaw-bar');
        bar.setAttribute('d', 'M8.4 17.8 L21.6 4.9 Q23.1 5.5 22.8 6.6 L9.8 19.4 Q8.6 18.8 8.4 17.8 Z');

        // Chain links are drawn as marching dashes along that same loop — the
        // dash offset animates, so the chain visibly runs around the bar
        // instead of the whole saw just wobbling.
        const chain = document.createElementNS(SVG_NS, 'path');
        chain.setAttribute('class', 'chainsaw-chain');
        chain.setAttribute('d', 'M8.4 17.8 L21.6 4.9 Q23.1 5.5 22.8 6.6 L9.8 19.4 Q8.6 18.8 8.4 17.8 Z');

        const sprocket = document.createElementNS(SVG_NS, 'circle');
        sprocket.setAttribute('class', 'chainsaw-sprocket');
        sprocket.setAttribute('cx', '9.6');
        sprocket.setAttribute('cy', '18.2');
        sprocket.setAttribute('r', '1.5');

        inner.appendChild(bar);
        inner.appendChild(chain);
        inner.appendChild(body);
        inner.appendChild(topHandle);
        inner.appendChild(rearHandle);
        inner.appendChild(sprocket);
        jitter.appendChild(inner);
        outer.appendChild(jitter);
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
