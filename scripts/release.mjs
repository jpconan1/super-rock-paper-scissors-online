import { readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function publishRelease(root = projectRoot, inputName) {
  if (!inputName || basename(inputName) !== inputName || !/^patch-notes-v\d+-\d{2}\.md$/.test(inputName)) {
    throw new Error('Expected filename patch-notes-vX-XX.md (example: patch-notes-v0-03.md).');
  }
  const [, majorText, minorText] = /^patch-notes-v(\d+)-(\d{2})\.md$/.exec(inputName);
  const version = `${Number(majorText)}.${minorText}`;
  if (majorText !== String(Number(majorText))) throw new Error('Major version must have no leading zero.');
  const sourcePath = resolve(root, 'assets/temp', inputName);
  const targetPath = resolve(root, 'newsletter', inputName);
  const recordPath = resolve(root, 'src/release.json');
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  const [currentMajor, currentMinor] = record.version.split('.').map(Number);
  if (Number(majorText) < currentMajor || (Number(majorText) === currentMajor && Number(minorText) <= currentMinor)) {
    throw new Error(`Version ${version} must be newer than ${record.version}.`);
  }
  if (existsSync(targetPath) || record.posts.some((post) => post.file === inputName || post.id === `version-${majorText}-${minorText}`)) {
    throw new Error(`Release ${version} already exists.`);
  }
  const source = readFileSync(sourcePath, 'utf8');
  if (!new RegExp(`^#\\s+Version\\s+${majorText}\\.${minorText}\\s*$`, 'm').test(source)) {
    throw new Error(`Patch notes need a "# Version ${version}" title.`);
  }
  const next = {
    ...record,
    version,
    posts: [{ id: `version-${majorText}-${minorText}`, file: inputName }, ...record.posts],
  };
  renameSync(sourcePath, targetPath);
  try { writeFileSync(recordPath, `${JSON.stringify(next, null, 2)}\n`); }
  catch (error) { renameSync(targetPath, sourcePath); throw error; }
  return version;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Published ${publishRelease(projectRoot, process.argv[2])}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
