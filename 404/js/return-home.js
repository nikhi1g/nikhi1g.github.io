export function initReturnHome() {
    const mainEl = document.querySelector('main');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Press any key (or click the hint link) to return home.
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

    document.addEventListener('keydown', (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === 'Shift' || event.key === 'Tab' || event.key === 'Escape') return;
        if (event.key.startsWith('F') && event.key.length > 1) return;
        // Activating a focused control (the theme toggle, a copy target) is not
        // a request to leave.
        const control = event.target instanceof Element
            && event.target.closest('button, [role="button"]');
        if (control && (event.key === 'Enter' || event.key === ' ')) return;
        goHome();
    });
    document.querySelector('.hint').addEventListener('click', (event) => {
        event.preventDefault();
        goHome();
    });
}
