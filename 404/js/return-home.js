export function initReturnHome() {
    const mainEl = document.querySelector('main');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Click anywhere / press any key to return home.
    let leaving = false;
    const goHome = () => {
        if (leaving) return;
        leaving = true;
        if (reduceMotion.matches) {
            window.location.href = '/';
            return;
        }
        mainEl.classList.add('leaving');
        setTimeout(() => { window.location.href = '/'; }, 180);
    };
    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (event.target.closest('a, button, #version, #inquiry-commit, .dot')) return;
        if (String(window.getSelection())) return;
        goHome();
    });
    document.addEventListener('keydown', (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === 'Shift' || event.key === 'Tab' || event.key === 'Escape') return;
        if (event.key.startsWith('F') && event.key.length > 1) return;
        goHome();
    });
    document.querySelector('.hint').addEventListener('click', (event) => {
        event.preventDefault();
        goHome();
    });
}
