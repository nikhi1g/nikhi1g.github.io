import fs from 'node:fs';
import path from 'node:path';
import {normalizePaper, readApprovedPapers} from './paper-schema.mjs';

function setOutput(name, value) {
    if (!process.env.GITHUB_OUTPUT) return;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/[\r\n]+/g, ' ')}\n`);
}

function createSubmission() {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const issueNumber = Number(event.issue?.number);
    const body = event.issue?.body || '';
    const match = body.match(/<!-- seminal-paper-submission:start -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- seminal-paper-submission:end -->/);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error('Issue number is missing.');
    if (!match) throw new Error('Issue does not contain a structured paper submission.');

    const paper = normalizePaper(JSON.parse(match[1]));
    const archiveHtml = fs.readFileSync('seminal_papers/index.html', 'utf8').toLowerCase();
    if (archiveHtml.includes(paper.url.toLowerCase()) || archiveHtml.includes(`>${paper.title.toLowerCase()}<`)) {
        throw new Error('This paper already exists in the original archive.');
    }

    const approved = readApprovedPapers();
    if (approved.some(item => item.url === paper.url || item.title.toLowerCase() === paper.title.toLowerCase())) {
        throw new Error('This paper already exists in approved submissions.');
    }

    const submissionPath = `seminal_papers/submissions/issue-${issueNumber}.json`;
    if (fs.existsSync(submissionPath)) throw new Error(`Issue ${issueNumber} already has a submission file.`);
    fs.mkdirSync(path.dirname(submissionPath), {recursive: true});
    fs.writeFileSync(submissionPath, `${JSON.stringify(paper, null, 2)}\n`);
    setOutput('submission_path', submissionPath);
}

try {
    createSubmission();
} catch (error) {
    setOutput('error', error.message || 'Unknown validation error.');
    console.error(error.message || error);
    process.exitCode = 1;
}
