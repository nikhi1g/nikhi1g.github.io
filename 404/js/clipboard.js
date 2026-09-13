export function initClipboard() {
    const inquiryEmail = document.getElementById('inquiry-email');
    const version = document.getElementById('version');
    const copyToast = document.getElementById('copy-toast');
    let copyToastTimer;
    const inquiryCommitEl = document.getElementById('inquiry-commit');
    const showCopyToast = (event, message, target, direction = 'up') => {
        const rect = target.getBoundingClientRect();
        const hasPointer = event.detail > 0 || event.clientX !== 0 || event.clientY !== 0;
        const x = hasPointer ? event.clientX : rect.left + rect.width / 2;
        const y = hasPointer ? event.clientY : rect.top + rect.height / 2;
        copyToast.setAttribute('aria-label', message);
        copyToast.style.left = `${x}px`;
        copyToast.style.top = `${y}px`;
        copyToast.classList.remove('show');
        copyToast.classList.toggle('down', direction === 'down');
        void copyToast.offsetWidth;
        copyToast.classList.add('show');
        clearTimeout(copyToastTimer);
        copyToastTimer = setTimeout(() => copyToast.classList.remove('show'), 700);
    };
    const copyText = async (text, event, target, direction) => {
        try {
            await navigator.clipboard.writeText(text);
            showCopyToast(event, 'Copied', target, direction);
        } catch {
            showCopyToast(event, 'Copy failed', target, direction);
        }
    };
    inquiryEmail.addEventListener('click', (event) => {
        event.preventDefault();
        copyText(inquiryEmail.textContent.trim(), event, inquiryEmail);
    });
    inquiryCommitEl.addEventListener('click', (event) => {
        event.preventDefault();
        copyText(inquiryCommitEl.textContent.trim(), event, inquiryCommitEl, 'down');
    });
    version.addEventListener('click', (event) => {
        event.preventDefault();
        const commit = version.dataset.commit || version.textContent.split('→').pop().replace('↻', '').trim();
        copyText(commit, event, version);
    });
}
