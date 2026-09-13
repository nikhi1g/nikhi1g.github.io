const GRAVITY = 981;
const MAX_HORIZONTAL_DISTANCE = 400;
const VERTICAL_CLEARANCE = 20;

const CLEANUP_DELAY = 0;

const ARROW_WIDTH = 18;
const ARROW_HEIGHT = 8;
const ARROW_DRAW_DURATION = 170;
const ARROW_FLIGHT_TIME = 0.35;

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

    const aimAt = (rect) => {
        const position = dot.pos();
        const target = targetCentre(rect);
        const angle = Math.atan2(target.x - position.x, position.y - target.y) * 180 / Math.PI;

        creature.style.setProperty('--aim', `${angle}`);
        creature.classList.add('holding-bow', 'drawing');
    };

    const makeArrow = () => {
        const arrow = document.createElement('div');
        arrow.className = 'bone-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.innerHTML = `
            <svg viewBox="0 0 18 8" width="18" height="8" aria-hidden="true" focusable="false">
                <line class="bone-arrow__shaft" x1="3.2" y1="4" x2="13.4" y2="4"></line>
                <circle class="bone-arrow__knob" cx="2.2" cy="2.6" r="1.2"></circle>
                <circle class="bone-arrow__knob" cx="2.2" cy="5.4" r="1.2"></circle>
                <polygon class="bone-arrow__tip" points="13.2,1.4 17,4 13.2,6.6"></polygon>
            </svg>`;
        return arrow;
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
        const spawn = kind === 'rocket' ? makeRocket() : makeArrow();
        aimAt(rect);

        if (prefersReducedMotion()) {
            creature.classList.remove('drawing', 'holding-bow');
            return;
        }

        await wait(drawDuration);
        creature.classList.remove('drawing');

        const origin = handPosition();
        const target = targetCentre(rect);
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        const vx = dx / flightTime;
        const vy = dy / flightTime - 0.5 * GRAVITY * flightTime;

        const angle = Math.atan2(vy, vx) * 180 / Math.PI;
        spawn.style.setProperty('--projectile-angle', `${angle}deg`);
        spawn.setAttribute('data-weapon', kind);
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
        if (CLEANUP_DELAY > 0) {
            setTimeout(() => spawn.remove(), CLEANUP_DELAY);
        }
    };

    const fire = async (rect) => {
        await fireProjectile(rect, {
            kind: 'arrow',
            drawDuration: ARROW_DRAW_DURATION,
            flightTime: ARROW_FLIGHT_TIME,
            width: ARROW_WIDTH,
            height: ARROW_HEIGHT
        });
    };

    const fireRocket = async (rect) => {
        await fireProjectile(rect, {
            kind: 'rocket',
            drawDuration: ROCKET_DRAW_DURATION,
            flightTime: ROCKET_FLIGHT_TIME,
            width: ROCKET_WIDTH,
            height: ROCKET_HEIGHT
        });
    };

    return {
        canHit,
        aimAt,
        fire,
        fireRocket
    };
}
