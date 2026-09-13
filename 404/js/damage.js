const TARGET_DEFINITIONS = [
    {selector: 'h1', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: true},
    {selector: '.message h2', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: true},
    {selector: '.message p', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim']},
    {selector: '.hint kbd', stages: ['dmg-crack', 'dmg-tilt']},
    {selector: 'footer', stages: ['dmg-split', 'dmg-tilt', 'dmg-dim']},
    {selector: 'footer span', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim']}
];

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DESKTOP_QUERY = '(min-width: 700px)';
const DEBRIS_SPEED = 60;
const DESKTOP_DEBRIS_SPEED = 90;
const DEBRIS_LIFT = -120;
const DESKTOP_DEBRIS_LIFT = -150;

const randomBetween = (min, max) => min + Math.random() * (max - min);

const copyHeadingFont = (clone, source) => {
    const style = window.getComputedStyle(source);
    // A detached span no longer inherits the heading's typography from its parent.
    // Copy the shorthand so the falling glyph keeps the same face, weight, and size.
    if (style.font) clone.style.font = style.font;
    if (style.color) clone.style.color = style.color;
    if (style.lineHeight) clone.style.lineHeight = style.lineHeight;
    if (style.letterSpacing) clone.style.letterSpacing = style.letterSpacing;
};

const splitText = (target) => {
    const originalText = target.textContent;
    const fragment = document.createDocumentFragment();
    const letters = [];

    for (const character of Array.from(originalText)) {
        const letter = document.createElement('span');
        letter.className = 'letter';
        letter.textContent = character;
        fragment.appendChild(letter);
        letters.push(letter);
    }

    target.replaceChildren(fragment);
    return {originalText, letters};
};

export function createDamage(dot) {
    const reduceMotion = window.matchMedia(REDUCE_MOTION_QUERY);
    const desktop = window.matchMedia(DESKTOP_QUERY).matches;
    const targets = [];
    const appliedLog = [];
    const debrisClones = new Set();

    for (const definition of TARGET_DEFINITIONS) {
        const element = document.querySelector(definition.selector);
        if (!element) continue;

        const stages = [...definition.stages];
        if (desktop) {
            stages.push('dmg-shatter');
            if (definition.letters) stages.push('dmg-collapse');
        }

        targets.push({
            el: element,
            stages,
            letters: definition.letters === true,
            applied: 0,
            originalText: null,
            letterSpans: null,
            falls: []
        });
    }

    const recordFor = (element) => targets.find((record) => record.el === element);

    const removeDebris = (fall) => {
        if (!fall?.clone) return;
        fall.clone.remove();
        debrisClones.delete(fall.clone);
        if (!debrisClones.size && typeof dot.clearDebris === 'function') {
            dot.clearDebris();
        }
    };

    const prepareHeading = (record) => {
        if (record.letterSpans) return;
        const split = splitText(record.el);
        record.originalText = split.originalText;
        record.letterSpans = split.letters;
    };

    const knockLooseLetter = (record) => {
        prepareHeading(record);

        const glyphs = record.letterSpans.filter((letter) => letter.textContent.trim() !== '');
        const stillPresent = glyphs.filter((letter) => !letter.classList.contains('letter-gone'));
        const previous = record.falls[record.falls.length - 1]?.letter;
        const preferred = stillPresent.find((letter) => letter !== previous);
        const fallen = preferred || glyphs.find((letter) => letter !== previous) || glyphs[0];
        if (!fallen) return null;

        const rect = fallen.getBoundingClientRect();
        const clone = fallen.cloneNode(true);
        clone.classList.remove('letter-gone');
        clone.classList.add('letter-debris');
        copyHeadingFont(clone, record.el);
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        document.body.appendChild(clone);
        // Keep at least one glyph readable even when a short heading (notably
        // "404") has fewer glyphs than desktop damage stages.
        if (stillPresent.length > 1 && stillPresent.includes(fallen)) {
            fallen.classList.add('letter-gone');
        }

        const fall = {letter: fallen, clone};
        record.falls.push(fall);
        debrisClones.add(clone);

        // Reduced motion keeps the damaged state static instead of handing the
        // clone to the physics integrator, which would make it fall.
        if (!reduceMotion.matches && typeof dot.spawnDebris === 'function') {
            const speed = desktop ? DESKTOP_DEBRIS_SPEED : DEBRIS_SPEED;
            dot.spawnDebris(
                clone,
                rect.left,
                rect.top,
                randomBetween(-speed, speed),
                desktop ? DESKTOP_DEBRIS_LIFT : DEBRIS_LIFT
            );
        }
        return fall;
    };

    const restoreFall = (record, fall) => {
        if (!fall) return;
        removeDebris(fall);
        const index = record.falls.lastIndexOf(fall);
        if (index !== -1) record.falls.splice(index, 1);
        if (!record.falls.some((other) => other.letter === fall.letter)) {
            fall.letter.classList.remove('letter-gone');
        }
    };

    const restoreHeading = (record) => {
        for (const fall of [...record.falls]) removeDebris(fall);
        if (record.originalText !== null) record.el.textContent = record.originalText;
        record.originalText = null;
        record.letterSpans = null;
        record.falls = [];
    };

    const nextBreakTarget = () => {
        let candidate = null;
        for (const record of targets) {
            if (record.applied >= record.stages.length) continue;
            if (!candidate || record.applied < candidate.applied) candidate = record;
        }
        return candidate ? candidate.el : null;
    };

    const nextFixTarget = () => {
        const top = appliedLog[appliedLog.length - 1];
        return top ? top.target : null;
    };

    const targetX = (target) => {
        const world = dot.world();
        const minimum = Math.min(world.left + 12, world.right - 12);
        const maximum = Math.max(world.left + 12, world.right - 12);
        const rect = target.getBoundingClientRect();
        return Math.max(minimum, Math.min(maximum, rect.left + rect.width / 2));
    };
    const targetRect = (target) => target.getBoundingClientRect();

    const breakStage = (target) => {
        const record = recordFor(target);
        if (!record || record.applied >= record.stages.length) return false;

        const stage = record.stages[record.applied];
        record.el.classList.add(stage);
        record.applied += 1;
        const fall = record.letters && (desktop || record.applied === 1)
            ? knockLooseLetter(record)
            : null;
        appliedLog.push({target: record.el, stage, fall});
        return true;
    };

    const fixStage = (target) => {
        const record = recordFor(target);
        const top = appliedLog[appliedLog.length - 1];
        if (!record || !top || top.target !== record.el) return false;

        appliedLog.pop();
        record.el.classList.remove(top.stage);
        record.applied -= 1;
        restoreFall(record, top.fall);
        if (record.applied === 0 && record.letters) restoreHeading(record);
        return true;
    };

    const isFullyBroken = () => targets.every((record) => record.applied === record.stages.length);
    const isFullyFixed = () => appliedLog.length === 0;

    return {
        nextBreakTarget,
        nextFixTarget,
        targetX,
        targetRect,
        breakStage,
        fixStage,
        isFullyBroken,
        isFullyFixed
    };
}
