import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const outputDirectory = process.argv[2] || '_site';
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim();

fs.rmSync(outputDirectory, {recursive: true, force: true});
fs.mkdirSync(outputDirectory, {recursive: true});
fs.copyFileSync('index.html', path.join(outputDirectory, 'index.html'));

// Unlinked routes: page only, source assets stay in the repo.
fs.mkdirSync(path.join(outputDirectory, 'whywork'), {recursive: true});
fs.copyFileSync('whywork/index.html', path.join(outputDirectory, 'whywork', 'index.html'));

const metadata = {
    commit: process.env.GITHUB_SHA || git('rev-parse', 'HEAD'),
    commit_date: git('show', '-s', '--format=%cI'),
    message: git('show', '-s', '--format=%s'),
};
if (!metadata.commit || !metadata.commit_date || !metadata.message) throw new Error('Commit metadata is incomplete.');
fs.writeFileSync(path.join(outputDirectory, 'commit.json'), `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`Built ${outputDirectory}.`);
