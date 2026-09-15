// Corner peel: once the creature's destruction sequence has fully finished,
// the bottom-right corner of the card (main) curls up off the page and flaps
// gently in the wind, like paper or a sticker peeling. No dependencies, no
// third-party code — a CSS 3D hinge triangle (see ../css/peel.css) driven
// here through custom properties so the flap can gust irregularly.
//
// Inert until called: importing this module touches nothing. The parent owns
// the wiring; the expected hook is a single lazy line at the end of the
// sequence (see the note on createPeel below).

const PEEL_MS = 1500;      // one-time lift: flat corner to full curl
const FLAP_BASE_DEG = 52;  // resting curl the flap breathes around
const STILL_DEG = 16;      // static curl under prefers-reduced-motion

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Wind gusts: three incommensurate sines plus a slow swell that swells and
// dies, so the flap breathes and occasionally shudders instead of ticking.
const gust = (t) => (
    9 * Math.sin(t * 4.4)
    + 5.5 * Math.sin(t * 8.1 + 1.7)
    + 2.5 * Math.sin(t * 17.3 + 0.6)
    + 12 * Math.pow(Math.max(0, Math.sin(t * 0.9 + 0.4)), 3)
);

const wobble = (t) => 3.5 * Math.sin(t * 3.1 + 2.0) + 1.5 * Math.sin(t * 9.7);

// Expected hook (parent adds this one line at the end of runSequence in
// creature.js, after the vacuum phase, where every phase is done):
//   void import('./peel.js').then((m) => m.createPeel().start());
export function createPeel(root) {
    const card = root
        || (typeof document !== 'undefined' ? document.querySelector('main') : null);

    let curl = null;
    let bedEl = null;
    let hinge = null;
    let started = false;
    let raf = 0;
    let clock = 0;
    let last = 0;

    const api = {
        start,
        peel: start,
        stop,
        reset,
        get active() {
            return started;
        }
    };

    // Missing card (or no DOM at all): stay inert, never throw.
    const usable = () => card && card.isConnected;

    function build() {
        if (curl && curl.isConnected) return true;
        if (!usable()) return false;
        // The card itself loses its corner: peel.css clips `main` on the fold
        // diagonal, so the element genuinely ends there and there is no card
        // face left under the flap to give it away.
        card.classList.add('peel-ready');
        // Adopt a peel another handle already built: start() must be safe to
        // call once per sequence watchdog, not once per handle object.
        curl = document.body.querySelector(':scope > .peel-curl');
        hinge = curl ? curl.querySelector('.peel-hinge') : null;
        bedEl = curl ? curl.querySelector('.peel-bed') : null;
        if (curl && hinge && bedEl) {
            place();
            return true;
        }
        if (curl) curl.remove();

        curl = document.createElement('div');
        curl.setAttribute('class', 'peel-curl');
        curl.setAttribute('aria-hidden', 'true');

        bedEl = document.createElement('div');
        bedEl.setAttribute('class', 'peel-bed');

        hinge = document.createElement('div');
        hinge.setAttribute('class', 'peel-hinge');

        const flap = document.createElement('div');
        flap.setAttribute('class', 'peel-flap');

        hinge.appendChild(flap);
        curl.appendChild(bedEl);
        curl.appendChild(hinge);
        // On `body`, not in the card: the card is clipped, and a child of a
        // clipped element would be cut off exactly where the curl overhangs.
        document.body.appendChild(curl);
        place();
        window.addEventListener('resize', place);
        return true;
    }

    // Park the curl on the card's bottom-right corner, in viewport coordinates,
    // and keep the clip and the curl the same size.
    function place() {
        if (!curl || !usable()) return;
        const box = card.getBoundingClientRect();
        const size = Math.round(Math.min(88, box.width * 0.13, box.height * 0.22));
        card.style.setProperty('--peel-size', `${size}px`);
        curl.style.setProperty('--peel-size', `${size}px`);
        curl.style.left = `${box.right - size}px`;
        curl.style.top = `${box.bottom - size}px`;
    }

    function setVars(liftDeg, skewDeg) {
        if (!curl) return;
        curl.style.setProperty('--peel-lift', `${liftDeg.toFixed(2)}deg`);
        curl.style.setProperty('--peel-skew', `${skewDeg.toFixed(2)}deg`);
        curl.style.setProperty('--peel-shade', Math.min(1, Math.max(0, liftDeg / 60)).toFixed(3));
    }

    function frame(now) {
        if (!started) return;
        const dt = Math.min(50, Math.max(0, now - last));
        last = now;
        clock += dt / 1000;
        if (clock * 1000 < PEEL_MS) {
            const t = easeOutCubic((clock * 1000) / PEEL_MS);
            setVars(t * FLAP_BASE_DEG, t * 2);
        } else {
            const t = (clock * 1000 - PEEL_MS) / 1000;
            setVars(FLAP_BASE_DEG + gust(t), wobble(t));
        }
        raf = requestAnimationFrame(frame);
    }

    // Idempotent: the sequence watchdog may fire this more than once, and a
    // second call while flapping must be a silent no-op, never a second loop.
    function start() {
        if (started) return api;
        if (!usable()) return api;
        // Another handle already runs the loop: adopt, do not double-drive.
        if (card.classList.contains('peeling')) {
            started = true;
            build();
            return api;
        }
        if (!build()) return api;
        started = true;
        card.classList.add('peeling');
        if (prefersReducedMotion()) {
            // On the curl, not the card: the flap lives on `body` now, so a
            // class on the card would never reach it.
            curl.classList.add('peel-still');
            return api;
        }
        clock = 0;
        last = performance.now();
        raf = requestAnimationFrame(frame);
        return api;
    }

    function stop() {
        started = false;
        cancelAnimationFrame(raf);
        raf = 0;
        return api;
    }

    function reset() {
        stop();
        window.removeEventListener('resize', place);
        if (curl && curl.isConnected) curl.remove();
        curl = null;
        bedEl = null;
        hinge = null;
        if (card && card.isConnected) {
            card.classList.remove('peel-ready', 'peeling');
            card.style.removeProperty('--peel-size');
        }
        return api;
    }

    return api;
}
