// Theme Toggle: the head script in 404.html already applied the theme before
// the first paint; this only flips it.
export function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    const root = document.documentElement;

    toggle.onclick = () => {
        const theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', theme);
        try {
            localStorage.setItem('theme', theme);
        } catch {}
    };
}
