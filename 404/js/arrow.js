const GRAVITY = 981;
const MAX_HORIZONTAL_DISTANCE = 400;
const VERTICAL_CLEARANCE = 20;
const DRAW_DURATION = 260;
const FLIGHT_TIME = 0.45;
const CLEANUP_DELAY = 400;
const ARROW_WIDTH = 18;
const ARROW_HEIGHT = 8;
const RIG_HEIGHT = 74;
const FEET_Y = 65.5;
const HAND_Y = 38.5;
const FALLBACK_HAND_RISE = 25;

const prefersReducedMotion = () => (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
        return rect.bottom < position.y - VERTICAL_CLEARANCE &&
            Math.abs(target.x - position.x) <= MAX_HORIZONTAL_DISTANCE;
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

    const fire = async (rect) => {
        aimAt(rect);

        if (prefersReducedMotion()) {
            creature.classList.remove('drawing', 'holding-bow');
            return;
        }

        await wait(DRAW_DURATION);
        creature.classList.remove('drawing');

        const origin = handPosition();
        const target = targetCentre(rect);
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        const vx = dx / FLIGHT_TIME;
        const vy = dy / FLIGHT_TIME - 0.5 * GRAVITY * FLIGHT_TIME;
        const arrow = makeArrow();

        arrow.style.setProperty('--arrow-angle', `${Math.atan2(vy, vx) * 180 / Math.PI}deg`);
        document.body.appendChild(arrow);
        dot.spawnDebris(
            arrow,
            origin.x - ARROW_WIDTH / 2,
            origin.y - ARROW_HEIGHT / 2,
            vx,
            vy
        );

        await wait(FLIGHT_TIME * 1000);
        creature.classList.remove('holding-bow');
        setTimeout(() => arrow.remove(), CLEANUP_DELAY);
    };

    return {canHit, aimAt, fire};
}
