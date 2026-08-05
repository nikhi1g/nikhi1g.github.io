# nikhi1g.github.io

Personal site hosted on GitHub Pages, plus several project pages published under the same domain from their own repos.

## Routes

![Route diagram](routes.svg)

Diagram source: [routes.mmd](routes.mmd). Re-render with `mmdc -i routes.mmd -o routes.svg -b white`.

In this repo:
- `/` — [index.html](index.html), landing page
- `/whywork/` — [whywork/index.html](whywork/index.html), a short piece on why grunt work matters. Not linked from anywhere and marked `noindex`

Published from other repos under the same GitHub Pages domain:
- `/seminal_papers/` — [nikhi1g/seminal_papers](https://github.com/nikhi1g/seminal_papers), a searchable archive of notable papers, essays, memos, and more
- `/mcat/` — [nikhi1g/mcat](https://github.com/nikhi1g/mcat)
- `/153b/` — [nikhi1g/153b](https://github.com/nikhi1g/153b)
- `/ucla-emt-course/` — [nikhi1g/ucla-emt-course](https://github.com/nikhi1g/ucla-emt-course)
- `/whisper_hotkey/` — [nikhi1g/whisper_hotkey](https://github.com/nikhi1g/whisper_hotkey)
- `/SpotifyAdSkipper/` — [nikhi1g/SpotifyAdSkipper](https://github.com/nikhi1g/SpotifyAdSkipper). Not linked from the landing page

Off-domain links on the landing page:
- [GitHub](https://github.com/nikhi1g?tab=repositories) and [LinkedIn](https://www.linkedin.com/in/nikhil---gupta/) in the nav
- [mem lines](https://memlines.com/) in the links list

Only `index.html`, `commit.json`, and `whywork/index.html` are deployed — [.github/scripts/build-site.mjs](.github/scripts/build-site.mjs) copies files into `_site` explicitly, so anything new in this repo has to be added there to go live.
