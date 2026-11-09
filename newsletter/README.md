# In-game newsletter

Click the logo on the title screen to open this newsletter. Markdown files here are the posts; edit those files to change the words shown in game.

- `patch-notes-v0-02.md` is the current, newest post.
- `2026-11-03-beta-patch-notes.md` is the previous post.
- `2026-09-12-super-abm-alpha.md` is the previous post.
- `2026-09-01-community-letter.md` is the oldest post.

`src/release.json` sets the current version and newest-first post order. `src/app/abmNewsletterModal.ts` loads those files and maps image markers in older posts to assets. The title-screen logo opens the newsletter through `src/title/titleScreen.ts` and `src/app/appController.ts`. For future releases, follow the root `AGENTS.md` workflow; the agent runs the release command after JP supplies the file.

The public `/patch-notes` archive renders the same posts in that order. No second copy of the writing is needed.
