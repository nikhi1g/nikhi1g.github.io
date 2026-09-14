const GRAVITY = 981;
const MAX_HORIZONTAL_DISTANCE = 400;
const VERTICAL_CLEARANCE = 20;

const CLEANUP_DELAY = 0;

const ARROW_WIDTH = 24;
const ARROW_HEIGHT = 8;
const ARROW_DRAW_DURATION = 170;
const ARROW_FLIGHT_TIME = 0.4375;

const AXE_WIDTH = 30;
const AXE_HEIGHT = 30;
const AXE_DRAW_DURATION = 220;
const AXE_FLIGHT_TIME = 0.6;

const ROCKET_WIDTH = 28;
const ROCKET_HEIGHT = 12;
const ROCKET_DRAW_DURATION = 140;
const ROCKET_FLIGHT_TIME = 0.45;

const RIG_HEIGHT = 74;
const FEET_Y = 65.5;
const HAND_Y = 38.5;
const FALLBACK_HAND_RISE = 25;

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const targetCentre = (rect) => ({
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2
});

const wait = (duration) => new Promise((resolve) => {
    setTimeout(resolve, duration);
});

export function createArrow(dot) {
    const creature = dot.el;
    let bow = null;
    let nocked = null;

    const handPosition = () => {
        const position = dot.pos();
        const figure = creature.querySelector('.figure');
        const renderedHeight = figure?.getBoundingClientRect().height || 0;
        const handRise = renderedHeight > 0
            ? renderedHeight * (FEET_Y - HAND_Y) / RIG_HEIGHT
            : FALLBACK_HAND_RISE;

        return {x: position.x, y: position.y - handRise};
    };

    const canHit = (rect) => {
        const position = dot.pos();
        const target = targetCentre(rect);
        return rect.bottom < position.y - VERTICAL_CLEARANCE
            && Math.abs(target.x - position.x) <= MAX_HORIZONTAL_DISTANCE;
    };

    const ensureBow = () => {
        if (bow) return bow;
        bow = document.createElement('div');
        bow.className = 'bone-bow';
        bow.setAttribute('aria-hidden', 'true');
        bow.innerHTML = `
            <svg viewBox="0 0 10 30" width="10" height="30" aria-hidden="true" focusable="false">
                <path class="bone-bow__limb" d="M2 1 Q8 8 8 15 Q8 22 2 29"></path>
                <line class="bone-bow__string" x1="2" y1="1" x2="2" y2="29"></line>
            </svg>
            <div class="bone-nocked">
                <svg viewBox="0 0 24 8" width="24" height="8" aria-hidden="true" focusable="false">
                    <line class="bone-arrow__shaft" x1="6" y1="4" x2="19" y2="4"></line>
                    <polygon class="bone-arrow__tip" points="18,1.2 24,4 18,6.8"></polygon>
                </svg>
            </div>`;
        document.body.appendChild(bow);
        nocked = bow.querySelector('.bone-nocked');
        return bow;
    };

    const aimAt = (rect) => {
        const position = dot.pos();
        const target = targetCentre(rect);
        const angle = Math.atan2(target.x - position.x, position.y - target.y) * 180 / Math.PI;

        creature.style.setProperty('--aim', `${angle}`);
        creature.classList.add('holding-bow', 'drawing');

        if (prefersReducedMotion()) return;
        const hand = handPosition();
        const bowEl = ensureBow();
        const flightAngle = Math.atan2(target.y - hand.y, target.x - hand.x) * 180 / Math.PI;
        bowEl.style.left = `${hand.x}px`;
        bowEl.style.top = `${hand.y}px`;
        bowEl.style.setProperty('--bow-angle', `${flightAngle}deg`);
        bowEl.classList.add('is-visible', 'is-drawing');
    };

    const makeArrow = () => {
        const arrow = document.createElement('div');
        arrow.className = 'bone-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = `
            <svg viewBox="0 0 24 8" width="24" height="8" aria-hidden="true" focusable="false">
                <line class="bone-arrow__shaft" x1="6" y1="4" x2="19" y2="4"></line>
                <polygon class="bone-arrow__tip" points="18,1.2 24,4 18,6.8"></polygon>
            </svg>`;
        return arrow;
    };

    // Thrown axe: Lucide axe paths (same set as the held tool in 404.html,
    // ISC License) at a readable 30px. Debris spin turns it into a spin.
    const makeAxe = () => {
        const axe = document.createElement('div');
        axe.className = 'bone-axe-thrown';
        axe.setAttribute('aria-hidden', 'true');
        axe.innerHTML = `
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
                <path class="bone-axe__handle" d="m14 12-8.381 8.38a1 1 0 0 1-3.001-3L11 9" />
                <path class="bone-axe__head" d="M15 15.5a.5.5 0 0 0 .5.5A6.5 6.5 0 0 0 22 9.5a.5.5 0 0 0-.5-.5h-1.672a2 2 0 0 1-1.414-.586l-5.062-5.062a1.205 1.205 0 0 0-1.704 0L9.352 5.648a1.205 1.205 0 0 0 0 1.704l5.062 5.062A2 2 0 0 1 15 13.828z" />
            </svg>`;
        return axe;
    };
    const makeRocket = () => {
        const rocket = document.createElement('div');
        rocket.className = 'bone-rocket';
        rocket.setAttribute('aria-hidden', 'true');
        rocket.innerHTML = `
            <svg viewBox="0 0 28 12" width="28" height="12" aria-hidden="true" focusable="false">
                <rect x="1" y="1.5" width="14" height="9" rx="3" ry="3"></rect>
                <polygon class="bone-rocket__fin" points="1,10 1,4 7,7"></polygon>
                <polygon class="bone-rocket__fin" points="15,1 15,11 21,7"></polygon>
                <circle class="bone-rocket__flame" cx="21.5" cy="6" r="4"></circle>
                <polygon class="bone-rocket__tip" points="15,1.2 28,6 15,10.8"></polygon>
            </svg>`;
        return rocket;
    };

    const fireProjectile = async (rect, {
        kind,
        drawDuration,
        flightTime,
        width,
        height
    }) => {
        const spawn = kind === 'rocket' ? makeRocket() : kind === 'axe' ? makeAxe() : makeArrow();
        aimAt(rect);

        if (prefersReducedMotion()) {
            creature.classList.remove('drawing', 'holding-bow');
            return null;
        }

        await wait(drawDuration);
        creature.classList.remove('drawing');
        if (bow) bow.classList.remove('is-drawing');
        if (nocked) nocked.style.opacity = '0';

        const origin = handPosition();
        const target = targetCentre(rect);
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        const vx = dx / flightTime;
        const vy = dy / flightTime - 0.5 * GRAVITY * flightTime;

        const angle = Math.atan2(vy, vx) * 180 / Math.PI;
        spawn.style.setProperty('--projectile-angle', `${angle}deg`);
        spawn.setAttribute('data-weapon', kind);
        // Inline before it joins the document: `body` is a flex container, and a
        // projectile that was briefly in flow would take width from the card.
        spawn.style.position = 'fixed';
        document.body.appendChild(spawn);
        dot.spawnDebris(
            spawn,
            origin.x - width / 2,
            origin.y - height / 2,
            vx,
            vy
        );

        await wait(flightTime * 1000);
        creature.classList.remove('holding-bow');
        if (bow) bow.classList.remove('is-visible');
        if (nocked) nocked.style.opacity = '';
        if (CLEANUP_DELAY > 0) {
            setTimeout(() => spawn.remove(), CLEANUP_DELAY);
        }

        return {vx, vy: vy + GRAVITY * flightTime};
    };
    const fire = async (rect) => {
        return fireProjectile(rect, {
            kind: 'arrow',
            drawDuration: ARROW_DRAW_DURATION,
            flightTime: ARROW_FLIGHT_TIME,
            width: ARROW_WIDTH,
            height: ARROW_HEIGHT
        });
    };

    const fireRocket = async (rect) => {
        return fireProjectile(rect, {
            kind: 'rocket',
            drawDuration: ROCKET_DRAW_DURATION,
            flightTime: ROCKET_FLIGHT_TIME,
            width: ROCKET_WIDTH,
            height: ROCKET_HEIGHT
        });
    };

    const fireAxe = async (rect) => {
        return fireProjectile(rect, {
            kind: 'axe',
            drawDuration: AXE_DRAW_DURATION,
            flightTime: AXE_FLIGHT_TIME,
            width: AXE_WIDTH,
            height: AXE_HEIGHT
        });
    };

    return {
        canHit,
        aimAt,
        fire,
        fireRocket,
        fireAxe
    };
}
