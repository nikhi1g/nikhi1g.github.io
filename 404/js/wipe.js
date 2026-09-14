// Washcloth: the creature wipes a mess off the page. Used on the shattered
// socket the thrown axe left in the header — the cloth works across it and the
// cracks come away stroke by stroke, then the chip, then the socket itself, so
// the page looks repaired rather than simply reset.

const CRACK_INTERVAL_MS = 240;   // one crack stroke disappears per beat
const CHIP_HOLD_MS = 260;        // a last rub before the punched-out chip goes

const SVG_NS = 'http://www.w3.org/2000/svg';

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
});

export function createWipe(dot) {
    const creature = dot.el;
    let cloth = null;

    // Runtime-built group inside #arm-r, mirroring the saw's nested transforms
    // so the arm carries it (see tools.css on why tools live there).
    const ensureCloth = () => {
        if (cloth && cloth.isConnected) return cloth;
        const armR = creature.querySelector('#arm-r');
        if (!armR) return null;
        const existing = armR.querySelector('#cloth');
        if (existing) {
            cloth = existing;
            return cloth;
        }

        const outer = document.createElementNS(SVG_NS, 'g');
        outer.setAttribute('id', 'cloth');
        outer.setAttribute('transform', 'rotate(38 22.5 38.5)');

        // Bare wrapper for the rub animation: a CSS transform animation replaces
        // a transform attribute outright, so it cannot live on the groups that
        // carry the grip.
        const rub = document.createElementNS(SVG_NS, 'g');
        rub.setAttribute('class', 'cloth-rub');

        const inner = document.createElementNS(SVG_NS, 'g');
        inner.setAttribute('transform', 'translate(11.271042 28.783493) rotate(-41) scale(0.70)');

        const body = document.createElementNS(SVG_NS, 'path');
        body.setAttribute('class', 'cloth-body');
        body.setAttribute('d', 'M1.6 20.4 L8.6 12.4 L18.6 18.4 L11.2 26.6 Z');

        const foldA = document.createElementNS(SVG_NS, 'path');
        foldA.setAttribute('class', 'cloth-fold');
        foldA.setAttribute('d', 'M5.6 19.4 L13.4 14.9');

        const foldB = document.createElementNS(SVG_NS, 'path');
        foldB.setAttribute('class', 'cloth-fold');
        foldB.setAttribute('d', 'M8.2 22.4 L16 17.9');

        inner.appendChild(body);
        inner.appendChild(foldA);
        inner.appendChild(foldB);
        rub.appendChild(inner);
        outer.appendChild(rub);
        armR.appendChild(outer);
        cloth = outer;
        return cloth;
    };

    // async (HTMLElement) => boolean. Works the cloth over `target`, removing its
    // crack strokes one at a time, then the chip, then the target itself.
    const wipeAway = async (target) => {
        try {
            if (!target || !target.isConnected || typeof target.getBoundingClientRect !== 'function') {
                return false;
            }
            if (target.dataset && target.dataset.wiped) return false;
            const rect = target.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return false;

            const cracks = [...target.querySelectorAll('.glass-hole__crack')];
            const chip = target.querySelector('.glass-hole__chip');
            if (cracks.length === 0 && !chip) return false;
            if (!ensureCloth()) return false;
            if (target.dataset) target.dataset.wiped = '1';

            creature.classList.add('wiping');
            const slow = prefersReducedMotion();
            const beat = slow ? 40 : CRACK_INTERVAL_MS;

            try {
                // Each pass takes one crack away. The fade is what sells it: the
                // socket visibly getting cleaner, not a single cut to nothing.
                for (const crack of cracks) {
                    if (!crack.isConnected) continue;
                    crack.style.transition = slow ? 'none' : 'opacity 0.22s ease-out';
                    crack.style.opacity = '0';
                    await wait(beat);
                    if (crack.isConnected) crack.remove();
                }

                if (chip && chip.isConnected) {
                    await wait(slow ? 20 : CHIP_HOLD_MS);
                    chip.style.transition = slow ? 'none' : 'opacity 0.24s ease-out';
                    chip.style.opacity = '0';
                    await wait(beat);
                    if (chip.isConnected) chip.remove();
                }

                if (target.isConnected) {
                    target.style.transition = slow ? 'none' : 'opacity 0.28s ease-out';
                    target.style.opacity = '0';
                    await wait(slow ? 20 : beat);
                    if (target.isConnected) target.remove();
                }
            } finally {
                creature.classList.remove('wiping');
            }

            return true;
        } catch (error) {
            void error;
            creature.classList.remove('wiping');
            return false;
        }
    };

    return {wipeAway};
}
