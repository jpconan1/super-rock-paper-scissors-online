# Project instructions

JP directs game design and content. You own code quality. Keep replies short and plain. Ignore spelling mistakes; use correct spelling in code and filenames. Do not replace JP's finished game copy or media with generated content. Code-made visuals are fine. Do not start a dev server unless asked.

When using anything from `old-project`, copy it into this project; never reference `old-project` at runtime. Treat `assets/temp` as JP's handoff folder: move used files to permanent project locations with hyphens in filenames, leave unused files there, and never reference `assets/temp` at runtime. Keep the folder.

## Patch notes releases

When JP hands over a new patch notes Markdown file, handle the whole release update. JP does not need to run or remember a command.

1. Read the file in `assets/temp`, check its intended version and copy, and fix only an obvious filename typo such as `path-notes` to `patch-notes`. Ask JP if the version or content is genuinely ambiguous; preserve the authored text.
2. Name the staged file `patch-notes-vX-XX.md`, where `X` is the major version and the minor version always has two digits. Its title must be `# Version X.XX`. The next release must be newer than `src/release.json`.
3. Run `npm run release -- patch-notes-vX-XX.md` yourself. This moves the file into `newsletter` and prepends it to `src/release.json`. That record drives the title link's version and the shared website and in-game newsletter post list. Do not hand the command to JP as an action item.
4. Build and run the relevant tests. Check `/patch-notes`, the title link, and the newest newsletter post. The newsletter stays manual-open. Do not deploy unless JP requests deployment.

Existing newsletter posts can contain visual markers mapped in `src/app/abmNewsletterModal.ts`. If a new post contains visual markers, wire them to real project assets before publishing.
