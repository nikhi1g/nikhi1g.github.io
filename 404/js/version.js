// Version Watcher
export function initVersionWatcher() {
    (async()=>{
        const el = document.getElementById('version');
        const dot = document.querySelector('.dot');
        const inquiryCommit = document.getElementById('inquiry-commit');
        const inquiryEmail = document.getElementById('inquiry-email');
        const setInquiryCommit = (commit) => {
            inquiryCommit.textContent = commit;
            inquiryEmail.href = 'mailto:2nikhilg@gmail.com?subject=' + encodeURIComponent('[' + commit + ']');
        };
        let localCommit = null;

        const check = async () => {
            try {
                const res = await fetch('/commit.json?t='+Date.now());
                if(!res.ok) return;
                const d = await res.json();
                const remote = d.commit.slice(0,7);
                setInquiryCommit(remote);

                if(!localCommit) {
                    localCommit = remote;
                    el.textContent = localCommit;
                    el.title = d.message || '';
                    el.onclick = () => window.location.href = `https://github.com/nikhi1g/nikhi1g.github.io/commit/${d.commit}`;
                    sessionStorage.setItem('v', localCommit);
                } else if(localCommit !== remote) {
                    el.innerHTML = `${localCommit}&rarr;${remote} <span style="font-size:12px">↻</span>`;
                    el.onclick = (e) => {
                        e.preventDefault();
                        location.reload();
                    };
                    el.style.opacity = 1;
                    el.style.color = '#f97316';
                    dot.style.backgroundColor = '#f97316';
                    dot.classList.add('pulse');
                }
            } catch(e){}
        };

        await check();
        setInterval(check, 30000);
        document.addEventListener('visibilitychange', () => {
            if(document.visibilityState === 'visible') check();
        });
    })();
}
