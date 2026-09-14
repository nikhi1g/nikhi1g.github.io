// 404 console + milestone harness. Zero dependencies (Node 18+ globals only).
// Launches its own static server and a headless Chrome, fails on any page
// error AND on sequence milestones never reached — silent try/catch deaths
// produce no console output, so milestones are the real regression net.
//
// Usage:
//   node 404/test/harness.mjs [--root .] [--page /404.html]
//     [--timeout 150] [--expect-debris 3] [--expect-hole] [--expect-axe]
//     [--allow commit.json] [--report /tmp/404-report.json]
// Exit codes: 0 pass, 1 assertion failure, 2 harness error.
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);

const ROOT = resolve(opt('--root', '.'));
const PAGE = opt('--page', '/404.html');
const TIMEOUT_S = Number(opt('--timeout', '240'));
const EXPECT_DEBRIS = Number(opt('--expect-debris', '3'));
const EXPECT_HOLE = !flag('--no-hole');
const EXPECT_AXE = !flag('--no-axe');
const EXPECT_PRY = !flag('--no-pry');
const EXPECT_SAW = !flag('--no-saw');
const EXPECT_CATCHES = Number(opt('--expect-catches', '1'));
const EXPECT_CLEANUP = flag('--expect-cleanup');
const ALLOW = args.filter((a, i) => args[i - 1] === '--allow');
const REPORT = opt('--report', join(tmpdir(), '404-harness-report.json'));

const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
    const {createServer} = await import('node:net');
    return new Promise((resolvePromise, rejectPromise) => {
        const s = createServer();
        s.listen(0, '127.0.0.1', () => {
            const {port} = s.address();
            s.close(() => resolvePromise(port));
        });
        s.on('error', rejectPromise);
    });
}

function startServer(port) {
    const server = spawn('python3', ['-c',
        'import http.server,functools,sys\n'
        + 'class H(http.server.SimpleHTTPRequestHandler):\n'
        + ' def end_headers(self):\n'
        + "  self.send_header('Cache-Control','no-store')\n"
        + '  super().end_headers()\n'
        + ' def log_message(self,*a):\n'
        + '  pass\n'
        + `http.server.ThreadingHTTPServer(('127.0.0.1',${port}),functools.partial(H,directory=r'${ROOT}')).serve_forever()`
    ], {stdio: 'ignore'});
    return server;
}

const rpc = (ws, id, method, params = {}) => new Promise((resolvePromise, rejectPromise) => {
    const payload = JSON.stringify({id, method, params});
    const onMessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(String(event.data));
        } catch {
            return;
        }
        if (msg.id === id) {
            ws.removeEventListener('message', onMessage);
            if (msg.error) rejectPromise(new Error(`${method}: ${msg.error.message}`));
            else resolvePromise(msg.result);
        }
    };
    ws.addEventListener('message', onMessage);
    ws.send(payload);
});

async function main() {
    const startedAt = Date.now();
    const errors = [];
    const failedRequests = [];
    const {existsSync} = await import('node:fs');
    const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!chrome) {
        console.error('harness error: no Chrome binary found');
        process.exit(2);
    }

    const httpPort = await freePort();
    const dbgPort = await freePort();
    const server = startServer(httpPort);
    const profile = mkdtempSync(join(tmpdir(), '404-harness-'));
    const chromeProc = spawn(chrome, [
        `--remote-debugging-port=${dbgPort}`,
        `--user-data-dir=${profile}`,
        '--headless=new',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=900,700',
        'about:blank'
    ], {stdio: 'ignore'});

    const killAll = () => {
        try {
            chromeProc.kill('SIGKILL');
        } catch {}
        try {
            server.kill('SIGKILL');
        } catch {}
    };
    process.on('exit', killAll);
    process.on('SIGINT', () => {
        killAll();
        process.exit(2);
    });

    try {
        // Wait for the DevTools endpoint.
        let version = null;
        for (let i = 0; i < 50; i += 1) {
            try {
                const res = await fetch(`http://127.0.0.1:${dbgPort}/json/version`);
                if (res.ok) {
                    version = await res.json();
                    break;
                }
            } catch {}
            await sleep(200);
        }
        if (!version) throw new Error('DevTools endpoint never came up');

        // Open the page in its own target and attach to it directly.
        const targetRes = await fetch(`http://127.0.0.1:${dbgPort}/json/new?http://127.0.0.1:${httpPort}${PAGE}`, {method: 'PUT'});
        if (!targetRes.ok) throw new Error('could not open page target');
        const target = await targetRes.json();

        const ws = new WebSocket(target.webSocketDebuggerUrl, []);
        await new Promise((resolvePromise, rejectPromise) => {
            ws.addEventListener('open', resolvePromise, {once: true});
            ws.addEventListener('error', rejectPromise, {once: true});
        });

        let rpcId = 0;
        const call = (method, params) => rpc(ws, ++rpcId, method, params);
        const failures = [];
        const isAllowed = (text) => ALLOW.some((pattern) => text.includes(pattern));

        ws.addEventListener('message', (event) => {
            let msg;
            try {
                msg = JSON.parse(String(event.data));
            } catch {
                return;
            }
            if (msg.id) return; // rpc reply handled elsewhere
            if (msg.method === 'Runtime.exceptionThrown') {
                const text = msg.params?.exceptionDetails?.text
                    || msg.params?.exceptionDetails?.exception?.description
                    || 'unknown page exception';
                if (!isAllowed(text)) failures.push({kind: 'pageerror', text});
            } else if (msg.method === 'Runtime.consoleAPICalled') {
                if (msg.params?.type === 'error') {
                    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
                    if (!isAllowed(text)) failures.push({kind: 'console-error', text});
                }
            } else if (msg.method === 'Log.entryAdded') {
                const entry = msg.params?.entry;
                if (entry && (entry.level === 'error' || entry.level === 'verbose' && false)) {
                    const text = `${entry.source}: ${entry.text} ${entry.url || ''}`;
                    if (!isAllowed(text)) failures.push({kind: 'log-error', text});
                }
            } else if (msg.method === 'Network.loadingFailed') {
                const text = msg.params?.errorText ? `${msg.params.errorText}` : 'load failed';
                failures.push({kind: 'request-failed', text, url: '(see network)'});
            } else if (msg.method === 'Network.responseReceived') {
                const {response} = msg.params || {};
                if (response && response.status >= 400 && response.type === 'Document') {
                    failures.push({kind: 'bad-document', text: `HTTP ${response.status}`, url: response.url});
                }
            }
        });

        await call('Runtime.enable');
        await call('Page.enable');
        await call('Log.enable');
        await call('Network.enable');

        const milestoneScript = `JSON.stringify({
            cls: document.querySelector('.dot')?.className || null,
            arrows: document.querySelectorAll('.bone-arrow').length,
            axe: document.querySelectorAll('.bone-axe-thrown').length,
            debris: document.querySelectorAll('body > .letter').length,
            hole: document.querySelectorAll('.glass-hole').length,
            rule: document.querySelectorAll('.pried-rule').length,
            ruleGone: !!document.querySelector('footer.rule-gone'),
            stairs: document.querySelectorAll('.stair').length,
            sawHalves: document.querySelectorAll('.saw-half').length,
            catches: document.querySelectorAll('.fish-catch').length,
            rod: document.querySelectorAll('#rod').length,
            wiped: document.querySelectorAll('.glass-hole').length === 0,
            remains: document.querySelectorAll('body > .letter, body > .word, body > .fish-catch, body > .bone-arrow, body > .bone-axe-thrown, body > .stair, body > .ladder-rail, body > .stair-riser, body > .pried-rule, body > .thrown-vacuum').length,
            iconHome: !!document.querySelector('header #theme-toggle')
        })`;
        let milestones = {};
        // Some milestones are transient by design: the staircase is cleared the
        // moment the creature has somewhere real to stand, so a final snapshot
        // can never see it. Accumulate maxima across the whole poll and assert
        // against those for anything that rises and falls.
        const peak = {};
        const deadline = Date.now() + TIMEOUT_S * 1000;
        let milestonePass = false;
        while (Date.now() < deadline) {
            const res = await call('Runtime.evaluate', {expression: milestoneScript, returnByValue: true});
            try {
                milestones = JSON.parse(res.result?.value || '{}');
            } catch {
                milestones = {};
            }
            for (const [key, value] of Object.entries(milestones)) {
                if (typeof value === 'number') peak[key] = Math.max(peak[key] || 0, value);
                else if (typeof value === 'boolean') peak[key] = peak[key] || value;
            }
            // Everything the cleanup pass tidies away — the thrown axe, the glass
            // socket, the pry bar, the caught words — exists only mid-run, so
            // these are judged on the peak, never on the final snapshot.
            const debrisOk = (peak.debris || 0) >= EXPECT_DEBRIS;
            const holeOk = !EXPECT_HOLE || (peak.hole || 0) > 0;
            const axeOk = !EXPECT_AXE || (peak.axe || 0) > 0;
            const pryOk = !EXPECT_PRY || (milestones.ruleGone === true && (peak.rule || 0) > 0);
            const sawOk = !EXPECT_SAW || ((peak.sawHalves || 0) >= 2 && (peak.stairs || 0) > 0);
            const catchOk = (peak.catches || 0) >= EXPECT_CATCHES;
            // Opt-in: the cleanup pass only starts once the fishing loop has
            // finished the whole sentence, which runs for minutes.
            const cleanOk = !EXPECT_CLEANUP || (milestones.wiped === true && (milestones.remains || 0) === 0);
            if (debrisOk && holeOk && axeOk && pryOk && sawOk && catchOk && cleanOk) {
                milestonePass = true;
                break;
            }
            await sleep(4000);
        }

        const milestoneFailures = [];
        if ((peak.debris || 0) < EXPECT_DEBRIS) {
            milestoneFailures.push({kind: 'milestone', text: `debris ${peak.debris || 0} < expected ${EXPECT_DEBRIS}`});
        }
        if (EXPECT_AXE && !(peak.axe > 0)) {
            milestoneFailures.push({kind: 'milestone', text: 'thrown axe never appeared'});
        }
        if (EXPECT_HOLE && !(peak.hole > 0)) {
            milestoneFailures.push({kind: 'milestone', text: 'glass hole never appeared'});
        }
        if (EXPECT_PRY && !(milestones.ruleGone === true && (peak.rule || 0) > 0)) {
            milestoneFailures.push({kind: 'milestone', text: 'footer rule was never pried off'});
        }
        if (EXPECT_SAW && !((peak.sawHalves || 0) >= 2)) {
            milestoneFailures.push({kind: 'milestone', text: `saw halves ${peak.sawHalves || 0} < 2`});
        }
        if (EXPECT_SAW && !((peak.stairs || 0) > 0)) {
            milestoneFailures.push({kind: 'milestone', text: 'no staircase was ever hammered'});
        }
        if ((peak.catches || 0) < EXPECT_CATCHES) {
            milestoneFailures.push({kind: 'milestone', text: `fish catches ${peak.catches || 0} < expected ${EXPECT_CATCHES}`});
        }
        if (EXPECT_CATCHES > 0 && !((peak.rod || 0) > 0)) {
            milestoneFailures.push({kind: 'milestone', text: 'fishing rod never appeared'});
        }
        if (EXPECT_CLEANUP && (peak.hole || 0) === 0) {
            // "wiped" is only meaningful if there was something to wipe.
            milestoneFailures.push({kind: 'milestone', text: 'nothing to wipe: the glass socket never appeared'});
        }
        if (EXPECT_CLEANUP && milestones.wiped !== true) {
            milestoneFailures.push({kind: 'milestone', text: 'the glass socket was never wiped away'});
        }
        if (EXPECT_CLEANUP && (milestones.remains || 0) !== 0) {
            milestoneFailures.push({kind: 'milestone', text: `${milestones.remains} swept/vacuumed items left on the page`});
        }
        if (EXPECT_HOLE && milestones.iconHome !== false) {
            milestoneFailures.push({kind: 'milestone', text: 'theme icon never left the header'});
        }

        const report = {
            pass: failures.length === 0 && milestonePass,
            page: `http://127.0.0.1:${httpPort}${PAGE}`,
            durationMs: Date.now() - startedAt,
            milestones,
            errors: [...failures, ...milestoneFailures],
            failedRequests,
            allowlist: ALLOW
        };
        writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
        for (const e of report.errors) console.log(`[${e.kind}] ${e.text}${e.url ? ` (${e.url})` : ''}`);
        console.log(report.pass ? 'HARNESS PASS' : 'HARNESS FAIL', JSON.stringify(milestones));
        console.log(`report: ${REPORT}`);
        ws.close();
        process.exit(report.pass ? 0 : 1);
    } catch (error) {
        console.error(`harness error: ${error.message}`);
        process.exit(2);
    } finally {
        killAll();
    }
}

main();
