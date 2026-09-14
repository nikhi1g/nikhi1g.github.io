// Broom: the creature sweeps the floor. Everything left lying on the ground is
// pushed toward the nearest page edge, and the moment a piece's box clears that
// edge it is handed to the debris system with outward velocity so it drops off
// the page and is removed — swept away as if it had never been there.

const PUSH_MS = 420;        // one accelerating shove per item
const GAP_MS = 70;          // breath between sweeps
const LINGER_MS = 1400;     // how long a swept piece is allowed to fall first

const SVG_NS = 'http://www.w3.org/2000/svg';

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
});

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

export function createSweep(dot) {
    const creature = dot.el;
    let broom = null;

    const ensureBroom = () => {
        if (broom && broom.isConnected) return broom;
        const armR = creature.querySelector('#arm-r');
        if (!armR) return null;
        const existing = armR.querySelector('#broom');
        if (existing) {
            broom = existing;
            return broom;
        }

        const outer = document.createElementNS(SVG_NS, 'g');
        outer.setAttribute('id', 'broom');
        outer.setAttribute('transform', 'rotate(38 22.5 38.5)');

        // Bare wrapper for the push stroke — see saw.css's nesting rule.
        const swing = document.createElementNS(SVG_NS, 'g');
        swing.setAttribute('class', 'broom-push');

        const inner = document.createElementNS(SVG_NS, 'g');
        inner.setAttribute('transform', 'translate(11.271042 28.783493) rotate(-41) scale(0.70)');

        const handle = document.createElementNS(SVG_NS, 'path');
        handle.setAttribute('class', 'broom-handle');
        handle.setAttribute('d', 'M2.5 21 L14 8.5');

        const head = document.createElementNS(SVG_NS, 'path');
        head.setAttribute('class', 'broom-head');
        head.setAttribute('d', 'M11.5 6.5 L17 11 L8.5 20.5 L3 16 Z');

        // Splayed bristles below the head.
        const bristles = document.createElementNS(SVG_NS, 'path');
        bristles.setAttribute('class', 'broom-bristles');
        bristles.setAttribute('d', 'M4 17 L1.5 20.5 M6.5 19 L4 23 M9 20.5 L6.5 24.5 M11.5 22 L9.5 25.5 M14 20 L13 24');

        inner.appendChild(handle);
        inner.appendChild(head);
        inner.appendChild(bristles);
        swing.appendChild(inner);
        outer.appendChild(swing);
        armR.appendChild(outer);
        broom = outer;
        return broom;
    };

    // Push one piece out of the page. Returns true once it has been handed off.
    const sweepOne = async (element, world) => {
        const rect = element.getBoundingClientRect();
        if (!rect || rect.width < 1 || rect.height < 1) return false;

        const pageMid = (world.left + world.right) / 2;
        const toLeft = rect.left + rect.width / 2 < pageMid;
        const edge = toLeft ? world.left : world.right;
        const travel = toLeft ? rect.left - edge + rect.width : edge - rect.right;
        const from = rect.left;

        element.style.position = 'fixed';
        element.style.margin = '0';
        element.style.pointerEvents = 'none';

        await tween(PUSH_MS, (t) => {
            // Accelerating shove, like a broom: slow to start, brisk at the end.
            const eased = t * t;
            element.style.left = `${from + (toLeft ? -1 : 1) * travel * eased}px`;
        });

        // Past the edge, it is the physics system's problem: it falls away and
        // is removed once it has had time to drop.
        const out = element.getBoundingClientRect();
        dot.spawnDebris(
            element,
            out.left,
            out.top,
            (toLeft ? -1 : 1) * (140 + Math.random() * 90),
            40,
            (toLeft ? -1 : 1) * (120 + Math.random() * 120)
        );
        setTimeout(() => {
            if (element.isConnected) element.remove();
        }, LINGER_MS);
        return true;
    };

    // async (Iterable<HTMLElement>) => number swept.
    const sweepAll = async (elements) => {
        const list = [...(elements || [])].filter((el) => el && el.isConnected);
        if (list.length === 0) return 0;
        if (!ensureBroom()) return 0;

        creature.classList.add('sweeping');
        let swept = 0;
        try {
            const world = dot.world();
            for (const element of list) {
                if (!element.isConnected) continue;
                if (prefersReducedMotion()) {
                    // No shove, just clear it off the page.
                    const rect = element.getBoundingClientRect();
                    element.style.position = 'fixed';
                    dot.spawnDebris(element, rect.left, rect.top, 60, 40, 90);
                    setTimeout(() => {
                        if (element.isConnected) element.remove();
                    }, LINGER_MS);
                    swept += 1;
                    continue;
                }
                const done = await sweepOne(element, world);
                if (done) swept += 1;
                await wait(GAP_MS);
            }
        } catch (error) {
            void error;
        } finally {
            creature.classList.remove('sweeping');
        }
        return swept;
    };

    return {sweepAll};
}
