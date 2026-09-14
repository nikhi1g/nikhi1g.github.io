const TARGET_DEFINITIONS = [
    // Deliberately no `main`: the card's rect is what physics derives the floor
    // and wall bounds from, so any stage that transformed or outlined the card
    // moved the world's own edges. Nothing may resize the bounding box.
    {selector: 'h1', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim', 'dmg-shatter'], letters: true},
    {selector: '.message h2', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim', 'dmg-shatter'], letters: true},
    {selector: '.message p', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: false},
    {selector: '#version', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: false},
    {selector: '#inquiry-commit', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: false},
    {selector: '#theme-toggle', stages: ['dmg-tilt', 'dmg-crack', 'dmg-shatter', 'dmg-dim'], letters: false},
    {selector: '.hint', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: false},
    {selector: '.hint kbd', stages: ['dmg-crack', 'dmg-tilt'], letters: false},
    {selector: '#inquiry-email', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: false},
    {selector: 'footer', stages: ['dmg-split', 'dmg-tilt', 'dmg-dim'], letters: false},
    {selector: 'footer span', stages: ['dmg-tilt', 'dmg-crack', 'dmg-dim'], letters: false}
];

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const DESKTOP_QUERY = '(min-width: 700px)';
const DEBRIS_SPEED = 60;
const DEBRIS_LIFT = -120;
const DESKTOP_DEBRIS_SPEED = 100;
const DESKTOP_DEBRIS_LIFT = -170;
const DEBRIS_CLASS = 'damage-fragment';

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

const styleFragmentElement = (fragment, rect, source) => {
    const sourceStyle = window.getComputedStyle(source);

    fragment.style.position = 'fixed';
    fragment.style.left = `${rect.left}px`;
    fragment.style.top = `${rect.top}px`;
    fragment.style.width = `${rect.width}px`;
    fragment.style.height = `${rect.height}px`;
    fragment.style.pointerEvents = 'none';
    fragment.style.boxSizing = sourceStyle.boxSizing || 'border-box';
    fragment.style.margin = '0';
    fragment.style.zIndex = '3';
    fragment.style.opacity = sourceStyle.opacity;
    fragment.style.transform = 'translate(0, 0)';
    fragment.classList.add(DEBRIS_CLASS);
};

const toFixedRect = (rect) => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
});

const placementFor = (node) => ({
    parent: node.parentElement,
    nextSibling: node.nextSibling
});

const restorePlacement = (node, placement) => {
    if (!placement || !placement.parent) {
        return;
    }

    if (placement.nextSibling && placement.nextSibling.parentNode === placement.parent) {
        placement.parent.insertBefore(node, placement.nextSibling);
        return;
    }

    const hasParent = placement.parent.contains(node);
    if (!hasParent) {
        placement.parent.appendChild(node);
    }
};

export function createDamage(dot) {
    const reduceMotion = window.matchMedia(REDUCE_MOTION_QUERY);
    const desktop = window.matchMedia(DESKTOP_QUERY).matches;
    const targets = [];
    const appliedLog = [];
    const debrisClones = new Set();
    const selectorSet = new Set();

    for (const definition of TARGET_DEFINITIONS) {
        const element = document.querySelector(definition.selector);
        if (!element) continue;
        if (selectorSet.has(element)) continue;

        const stages = [...definition.stages];
        if (desktop && definition.letters) {
            stages.push('dmg-collapse');
        }

        selectorSet.add(element);
        targets.push({
            el: element,
            stages,
            letters: definition.letters === true,
            applied: 0,
            originalText: null,
            letterSpans: null,
            falls: [],
            brokenLetters: new Set()
        });
    }

    const recordFor = (element) => targets.find((record) => record.el === element);

    const removeDebris = (fall) => {
        if (!fall?.node) return;
        if (fall.node.parentNode) {
            fall.node.parentNode.removeChild(fall.node);
        }
        debrisClones.delete(fall.node);
    };

    const restoreNodeFromFall = (fall, record) => {
        const node = fall.node;
        const restore = fall.restore;

        removeDebris(fall);

        if (!node) return;
        restorePlacement(node, restore);
        if (!node.parentNode) {
            if (record?.el && record.el.parentElement) {
                record.el.parentElement.appendChild(node);
            } else {
                document.body.appendChild(node);
            }
        }

        node.style.cssText = fall.inlineStyle || '';
        if (typeof fall.className === 'string') {
            node.className = fall.className;
        }
        if (fall.id) {
            node.setAttribute('id', fall.id);
        }
        node.classList.remove(DEBRIS_CLASS);
    };

    const prepareHeading = (record) => {
        if (record.letterSpans) return;
        const split = splitText(record.el);
        record.originalText = split.originalText;
        record.letterSpans = split.letters;
    };

    const captureDebris = (record, node, isLetter = false) => {
        const rect = toFixedRect(node.getBoundingClientRect());
        if (rect.width < 1 || rect.height < 1) return null;

        const fall = {
            node,
            inlineStyle: node.getAttribute('style') || '',
            className: node.className,
            restore: placementFor(node),
            letter: isLetter ? node : null,
            id: node.getAttribute('id') || null
        };

        if (isLetter) {
            copyHeadingFont(node, record.el);
            node.classList.remove('letter');
            node.classList.add('letter-debris');
        }
        if (fall.id) {
            node.removeAttribute('id');
        }

        styleFragmentElement(node, rect, record.el);

        if (node.parentElement) {
            node.parentElement.removeChild(node);
        }
        document.body.appendChild(node);
        return fall;
    };

    const knockLooseLetter = (record) => {
        prepareHeading(record);

        const glyphs = record.letterSpans.filter((letter) => letter.textContent.trim() !== '');
        const stillPresent = glyphs.filter((letter) => !record.brokenLetters.has(letter));
        if (stillPresent.length === 0) return null;

        const previous = record.falls[record.falls.length - 1]?.letter;
        const preferred = stillPresent.find((letter) => letter !== previous);
        const fallen = preferred || stillPresent[0];
        if (!fallen) return null;

        const fall = captureDebris(record, fallen, true);
        if (!fall) return null;

        record.falls.push(fall);
        debrisClones.add(fall.node);

        if (!reduceMotion.matches && typeof dot.spawnDebris === 'function') {
            const speed = desktop ? DESKTOP_DEBRIS_SPEED : DEBRIS_SPEED;
            const lift = desktop ? DESKTOP_DEBRIS_LIFT : DEBRIS_LIFT;
            dot.spawnDebris(
                fall.node,
                toFixedRect(fallen.getBoundingClientRect()).left,
                toFixedRect(fallen.getBoundingClientRect()).top,
                randomBetween(-speed, speed),
                lift
            );
        }

        return fall;
    };

    const knockLooseElement = (record) => {
        if (record.falls.some((fall) => fall.letter === null)) {
            return null;
        }

        const fall = captureDebris(record, record.el, false);
        if (!fall) return null;

        record.falls.push(fall);
        debrisClones.add(fall.node);

        if (!reduceMotion.matches && typeof dot.spawnDebris === 'function') {
            const speed = desktop ? DESKTOP_DEBRIS_SPEED : DEBRIS_SPEED;
            const lift = desktop ? DESKTOP_DEBRIS_LIFT : DEBRIS_LIFT;
            const sourceRect = toFixedRect(record.el.getBoundingClientRect());
            dot.spawnDebris(
                fall.node,
                sourceRect.left,
                sourceRect.top,
                randomBetween(-speed, speed),
                lift
            );
        }

        return fall;
    };

    const restoreFall = (record, fall) => {
        if (!fall) return;

        const index = record.falls.lastIndexOf(fall);
        if (index !== -1) {
            record.falls.splice(index, 1);
        }

        if (record.letterSpans && fall.letter) {
            restoreNodeFromFall(fall, record);
            record.brokenLetters.delete(fall.letter);
            return;
        }

        restoreNodeFromFall(fall, record);
    };

    const restoreHeading = (record) => {
        for (const fall of [...record.falls]) {
            restoreFall(record, fall);
            debrisClones.delete(fall.node);
        }

        if (record.originalText !== null) {
            record.el.textContent = record.originalText;
        }
        record.originalText = null;
        record.letterSpans = null;
        record.falls = [];
        record.brokenLetters.clear();
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

        const fall = record.letters
            ? knockLooseLetter(record)
            : knockLooseElement(record);

        if (record.letters && stage === 'dmg-shatter' && !record.letterSpans?.length) {
            // Should not happen but guarantees no undefined entry if splitText fails.
            record.letterSpans = [];
        }

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

    const isTargetBroken = (target) => {
        const record = recordFor(target);
        return Boolean(record && record.applied >= record.stages.length);
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
        isTargetBroken,
        isFullyBroken,
        isFullyFixed
    };
}
