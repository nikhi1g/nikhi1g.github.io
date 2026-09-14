// Vacuum: the last pass. Anything still loose on the page — spent weapons,
// stray debris, out-of-place icons — is drawn into the nozzle and vanishes, and
// then the vacuum itself is thrown off the edge so the creature is not left
// holding the evidence.

const SUCK_MS = 460;        // one item, mouth to gone
const GAP_MS = 60;
const FLING_MS = 520;

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

export function createVacuum(dot) {
    const creature = dot.el;
    let vacuum = null;

    const ensureVacuum = () => {
        if (vacuum && vacuum.isConnected) return vacuum;
        const armR = creature.querySelector('#arm-r');
        if (!armR) return null;
        const existing = armR.querySelector('#vacuum');
        if (existing) {
            vacuum = existing;
            return vacuum;
        }

        const outer = document.createElementNS(SVG_NS, 'g');
        outer.setAttribute('id', 'vacuum');
        outer.setAttribute('transform', 'rotate(38 22.5 38.5)');

        // Bare wrapper for the motor judder — see saw.css's nesting rule.
        const jitter = document.createElementNS(SVG_NS, 'g');
        jitter.setAttribute('class', 'vacuum-jitter');

        const inner = document.createElementNS(SVG_NS, 'g');
        inner.setAttribute('transform', 'translate(11.271042 28.783493) rotate(-41) scale(0.70)');

        const canister = document.createElementNS(SVG_NS, 'path');
        canister.setAttribute('class', 'vacuum-body');
        canister.setAttribute('d', 'M1.8 13.2 h6.6 a2.4 2.4 0 0 1 2.4 2.4 v4.6 a2.4 2.4 0 0 1 -2.4 2.4 h-6.6 a2.4 2.4 0 0 1 -2.4 -2.4 v-4.6 a2.4 2.4 0 0 1 2.4 -2.4 z');

        const wheel = document.createElementNS(SVG_NS, 'circle');
        wheel.setAttribute('class', 'vacuum-wheel');
        wheel.setAttribute('cx', '4.6');
        wheel.setAttribute('cy', '23.2');
        wheel.setAttribute('r', '1.8');

        const hose = document.createElementNS(SVG_NS, 'path');
        hose.setAttribute('class', 'vacuum-hose');
        hose.setAttribute('d', 'M11 17.5 q6 1.4 6.6 6.4 q0.4 3.4 -2 4.6');

        const nozzle = document.createElementNS(SVG_NS, 'path');
        nozzle.setAttribute('class', 'vacuum-nozzle');
        nozzle.setAttribute('d', 'M14 28.5 h4.6 v2.6 h-4.6 z');

        inner.appendChild(canister);
        inner.appendChild(wheel);
        inner.appendChild(hose);
        inner.appendChild(nozzle);
        jitter.appendChild(inner);
        outer.appendChild(jitter);
        armR.appendChild(outer);
        vacuum = outer;
        return vacuum;
    };

    // Where the suction comes from: the fist, which is where the nozzle is.
    const mouth = () => {
        const rect = creature.getBoundingClientRect();
        return {x: rect.left + rect.width / 2, y: rect.bottom + 6};
    };

    // async (Iterable<HTMLElement>) => number consumed.
    const suckAll = async (elements) => {
        const list = [...(elements || [])].filter((el) => el && el.isConnected);
        if (list.length === 0) return 0;
        if (!ensureVacuum()) return 0;

        creature.classList.add('vacuuming');
        let eaten = 0;
        try {
            for (const element of list) {
                if (!element.isConnected) continue;
                if (element.dataset && element.dataset.sucked) continue;
                if (element.dataset) element.dataset.sucked = '1';

                const rect = element.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) continue;
                const from = {left: rect.left, top: rect.top};

                element.style.position = 'fixed';
                element.style.margin = '0';
                element.style.pointerEvents = 'none';
                element.style.transformOrigin = '50% 50%';

                if (prefersReducedMotion()) {
                    element.remove();
                    eaten += 1;
                    continue;
                }

                await tween(SUCK_MS, (t) => {
                    const eased = t * t;
                    const goal = mouth();
                    element.style.left = `${from.left + (goal.x - element.offsetWidth / 2 - from.left) * eased}px`;
                    element.style.top = `${from.top + (goal.y - element.offsetHeight / 2 - from.top) * eased}px`;
                    element.style.transform = `scale(${Math.max(0.05, 1 - eased * 0.95)}) rotate(${eased * 120}deg)`;
                    element.style.opacity = `${Math.max(0, 1 - eased * 0.6)}`;
                });

                if (element.isConnected) element.remove();
                eaten += 1;
                await wait(GAP_MS);
            }
        } catch (error) {
            void error;
        } finally {
            creature.classList.remove('vacuuming');
        }
        return eaten;
    };

    // async () => void. The vacuum follows everything else off the page.
    const throwAway = async () => {
        try {
            const vacuumEl = ensureVacuum();
            if (!vacuumEl) return;
            const world = dot.world();
            const hand = mouth();
            const toLeft = hand.x < (world.left + world.right) / 2;

            creature.classList.add('vacuuming');
            if (!prefersReducedMotion()) {
                await tween(FLING_MS, (t) => {
                    const eased = t * t;
                    vacuumEl.setAttribute('transform', `rotate(${38 + eased * 300} 22.5 38.5)`);
                });
            }
            creature.classList.remove('vacuuming');

            // Hand the tool itself to the debris system, thrown outward past the
            // edge, then make sure it is gone for good.
            const clone = vacuumEl.cloneNode(true);
            clone.removeAttribute('id');
            clone.setAttribute('class', 'thrown-vacuum');
            clone.style.position = 'fixed';
            document.body.appendChild(clone);
            dot.spawnDebris(
                clone,
                hand.x,
                hand.y,
                (toLeft ? -1 : 1) * (160 + Math.random() * 80),
                -60,
                (toLeft ? -1 : 1) * 300
            );
            setTimeout(() => {
                if (clone.isConnected) clone.remove();
            }, 1600);

            if (vacuumEl.isConnected) vacuumEl.remove();
        } catch (error) {
            void error;
            creature.classList.remove('vacuuming');
        }
    };

    return {suckAll, throwAway};
}
