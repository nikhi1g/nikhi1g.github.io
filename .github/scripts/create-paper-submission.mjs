import fs from 'node:fs';

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const body = event.issue?.body || '';
const match = body.match(/<!-- seminal-paper-submission:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- seminal-paper-submission:end -->/);

if (!match) throw new Error('Issue does not contain a structured paper submission.');

const paper = JSON.parse(match[1]);
const required = ['title', 'url', 'author', 'year', 'sector', 'format'];
const allowed = [...required, 'company', 'doi'];
const formats = ['Book', 'Deck', 'Essay', 'Essay Series', 'Letter', 'Manifesto', 'Memo', 'Op-Ed', 'Paper', 'Presentation', 'Report', 'Research', 'Whitepaper'];

if (Object.keys(paper).some(key => !allowed.includes(key))) throw new Error('Submission contains an unsupported field.');
for (const key of required) {
    if (!String(paper[key] || '').trim()) throw new Error(`Missing required field: ${key}`);
}

function clean(value, maxLength) {
    const normalized = String(value || '').trim();
    if (normalized.length > maxLength || /[<>\u0000-\u001f]/.test(normalized)) throw new Error('Submission contains invalid text.');
    return normalized;
}

function validUrl(value, required = false) {
    const normalized = clean(value, 500);
    if (!normalized && !required) return '';
    const url = new URL(normalized);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Links must use HTTP or HTTPS.');
    return url.href;
}

const year = Number(paper.year);
if (!Number.isInteger(year) || year < 1800 || year > 2100) throw new Error('Year must be between 1800 and 2100.');
if (!formats.includes(paper.format)) throw new Error('Invalid format.');

const normalized = {
    title: clean(paper.title, 180),
    url: validUrl(paper.url, true),
    doi: validUrl(paper.doi),
    author: clean(paper.author, 160),
    company: clean(paper.company, 120),
    year: String(year),
    sector: clean(paper.sector, 80),
    format: paper.format,
};

const path = 'seminal_papers/submissions.json';
const submissions = JSON.parse(fs.readFileSync(path, 'utf8'));
const archiveHtml = fs.readFileSync('seminal_papers/index.html', 'utf8').toLowerCase();
if (archiveHtml.includes(normalized.url.toLowerCase()) || archiveHtml.includes(`>${normalized.title.toLowerCase()}<`)) {
    throw new Error('This paper already exists in the archive.');
}
if (submissions.some(item => item.url === normalized.url || item.title.toLowerCase() === normalized.title.toLowerCase())) {
    throw new Error('This paper already exists in submissions.json.');
}

submissions.push(normalized);
fs.writeFileSync(path, `${JSON.stringify(submissions, null, 2)}\n`);
