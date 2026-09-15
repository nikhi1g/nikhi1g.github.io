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
        card.classList.add('peel-ready');
        // Adopt a peel another handle already built: start() must be safe to
        // call once per sequence watchdog, not once per handle object.
        curl = card.querySelector(':scope > .peel-curl');
        bedEl = card.querySelector(':scope > .peel-bed');
        hinge = curl ? curl.querySelector('.peel-hinge') : null;
        if (curl && bedEl && hinge) return true;
        if (curl) curl.remove();
        if (bedEl) bedEl.remove();
        bedEl = document.createElement('div');
        bedEl.setAttribute('class', 'peel-bed');
        bedEl.setAttribute('aria-hidden', 'true');

        curl = document.createElement('div');
        curl.setAttribute('class', 'peel-curl');
        curl.setAttribute('aria-hidden', 'true');

        hinge = document.createElement('div');
        hinge.setAttribute('class', 'peel-hinge');

        const flap = document.createElement('div');
        flap.setAttribute('class', 'peel-flap');

        hinge.appendChild(flap);
        curl.appendChild(hinge);
        card.appendChild(bedEl);
        card.appendChild(curl);
        return true;
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
            card.classList.add('peel-still');
            return api;
        }
        clock = 0;
        last = performance.now();
        raf = requestAnimationFrame(frame);
        return api;
    }

    function stop() {
        started = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return api;
    }

    function reset() {
        stop();
        if (curl && curl.isConnected) curl.remove();
        if (bedEl && bedEl.isConnected) bedEl.remove();
        curl = null;
        bedEl = null;
        hinge = null;
        if (card && card.isConnected) {
            card.classList.remove('peel-ready', 'peeling', 'peel-still');
        }
        return api;
    }

    return api;
}
