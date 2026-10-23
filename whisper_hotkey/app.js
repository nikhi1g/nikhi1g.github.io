const sourceButton = document.querySelector('[data-source-button]');
const sourceRevision = document.querySelector('[data-source-revision]');

const refreshSourceRevision = async () => {
  if (!sourceButton || !sourceRevision) return;
  try {
    const response = await fetch(`./build.json?t=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) return;
    const build = await response.json();
    const branchIsValid = typeof build.branch === 'string' && /^[A-Za-z0-9._/-]+$/.test(build.branch);
    const commitIsValid = typeof build.commit === 'string' && /^[0-9a-f]{40}$/i.test(build.commit);
    if (!branchIsValid || !commitIsValid) return;
    const shortCommit = build.commit.slice(0, 7);
    sourceRevision.textContent = `${build.branch}:${shortCommit}`;
    sourceButton.title = `View main. Current site build ${shortCommit}`;
  } catch {
    // Keep the revision stamped into the deployed HTML.
  }
};

document.getElementById('year').textContent = new Date().getFullYear();
refreshSourceRevision();
