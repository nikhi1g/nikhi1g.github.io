const TARGET_DEFINITIONS = [
    {selector: 'h1', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: true},
    {selector: '.message h2', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: true},
    {selector: '.message p', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim']},
    {selector: '.hint kbd', stages: ['dmg-crack', 'dmg-tilt']},
    {selector: 'footer', stages: ['dmg-split', 'dmg-tilt', 'dmg-dim']},
    {selector: 'footer span', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim']}
];

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DEBRIS_SPEED = 60;
const DEBRIS_LIFT = -120;

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
    const targets = [];
    const appliedLog = [];
    const debrisClones = new Set();

    for (const definition of TARGET_DEFINITIONS) {
        const element = document.querySelector(definition.selector);
        if (!element) continue;
        targets.push({
            el: element,
            stages: definition.stages,
            letters: definition.letters === true,
            applied: 0,
            originalText: null,
            letterSpans: null,
            fallenLetter: null,
            debrisClone: null
        });
    }

    const recordFor = (element) => targets.find((record) => record.el === element);

    const removeDebris = (record) => {
        if (record.debrisClone) {
            record.debrisClone.remove();
            debrisClones.delete(record.debrisClone);
            record.debrisClone = null;
        }
        if (!debrisClones.size && typeof dot.clearDebris === 'function') {
            dot.clearDebris();
        }
    };

    const knockLooseLetter = (record) => {
        const split = splitText(record.el);
        record.originalText = split.originalText;
        record.letterSpans = split.letters;

        // Lose the first visible glyph, rather than a space, so the heading remains
        // legible while still visibly shedding a character.
        const fallen = split.letters.find((letter) => letter.textContent.trim() !== '') || split.letters[0];
        if (!fallen) return;

        const rect = fallen.getBoundingClientRect();
        const clone = fallen.cloneNode(true);
        clone.classList.remove('letter-gone');
        clone.classList.add('letter-debris');
        copyHeadingFont(clone, record.el);
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        document.body.appendChild(clone);
        fallen.classList.add('letter-gone');
        record.fallenLetter = fallen;
        record.debrisClone = clone;
        debrisClones.add(clone);

        // Reduced motion keeps the damaged state static instead of handing the
        // clone to the physics integrator, which would make it fall.
        if (!reduceMotion.matches && typeof dot.spawnDebris === 'function') {
            dot.spawnDebris(
                clone,
                rect.left,
                rect.top,
                randomBetween(-DEBRIS_SPEED, DEBRIS_SPEED),
                DEBRIS_LIFT
            );
        }
    };

    const restoreHeading = (record) => {
        removeDebris(record);
        if (record.fallenLetter) record.fallenLetter.classList.remove('letter-gone');
        if (record.originalText !== null) record.el.textContent = record.originalText;
        record.originalText = null;
        record.letterSpans = null;
        record.fallenLetter = null;
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

    const breakStage = (target) => {
        const record = recordFor(target);
        if (!record || record.applied >= record.stages.length) return false;

        const stage = record.stages[record.applied];
        record.el.classList.add(stage);
        record.applied += 1;
        appliedLog.push({target: record.el, stage});

        if (record.letters && record.applied === 1) knockLooseLetter(record);
        return true;
    };

    const fixStage = (target) => {
        const record = recordFor(target);
        const top = appliedLog[appliedLog.length - 1];
        if (!record || !top || top.target !== record.el) return false;

        appliedLog.pop();
        record.el.classList.remove(top.stage);
        record.applied -= 1;
        if (record.applied === 0 && record.letters) restoreHeading(record);
        return true;
    };

    const isFullyBroken = () => targets.every((record) => record.applied === record.stages.length);
    const isFullyFixed = () => appliedLog.length === 0;

    return {
        nextBreakTarget,
        nextFixTarget,
        targetX,
        breakStage,
        fixStage,
        isFullyBroken,
        isFullyFixed
    };
}
