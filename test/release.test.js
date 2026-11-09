import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { publishRelease } from '../scripts/release.mjs';

function fixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), 'abm-release-'));
  mkdirSync(resolve(root, 'assets/temp'), { recursive: true });
  mkdirSync(resolve(root, 'newsletter'));
  mkdirSync(resolve(root, 'src'));
  writeFileSync(resolve(root, 'src/release.json'), JSON.stringify({ version: '0.02', posts: [{ id: 'version-0-02', file: 'patch-notes-v0-02.md' }] }));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('release command', () => {
  test('publishes a newer version and leaves unrelated temp files', () => fixture((root) => {
    writeFileSync(resolve(root, 'assets/temp/patch-notes-v0-03.md'), '# Version 0.03\nA fix.\n');
    writeFileSync(resolve(root, 'assets/temp/other.txt'), 'keep');
    expect(publishRelease(root, 'patch-notes-v0-03.md')).toBe('0.03');
    expect(readFileSync(resolve(root, 'newsletter/patch-notes-v0-03.md'), 'utf8')).toBe('# Version 0.03\nA fix.\n');
    expect(existsSync(resolve(root, 'assets/temp/patch-notes-v0-03.md'))).toBe(false);
    expect(existsSync(resolve(root, 'assets/temp/other.txt'))).toBe(true);
    const record = JSON.parse(readFileSync(resolve(root, 'src/release.json'), 'utf8'));
    expect(record.version).toBe('0.03');
    expect(record.posts[0]).toEqual({ id: 'version-0-03', file: 'patch-notes-v0-03.md' });
  }));

  test('advances from 0.09 to 0.10', () => fixture((root) => {
    writeFileSync(resolve(root, 'src/release.json'), JSON.stringify({ version: '0.09', posts: [] }));
    writeFileSync(resolve(root, 'assets/temp/patch-notes-v0-10.md'), '# Version 0.10\n');
    expect(publishRelease(root, 'patch-notes-v0-10.md')).toBe('0.10');
  }));

  test('rejects an existing destination without changing files', () => fixture((root) => {
    writeFileSync(resolve(root, 'assets/temp/patch-notes-v0-03.md'), '# Version 0.03\n');
    writeFileSync(resolve(root, 'newsletter/patch-notes-v0-03.md'), 'existing');
    const before = readFileSync(resolve(root, 'src/release.json'), 'utf8');
    expect(() => publishRelease(root, 'patch-notes-v0-03.md')).toThrow('already exists');
    expect(readFileSync(resolve(root, 'src/release.json'), 'utf8')).toBe(before);
    expect(readFileSync(resolve(root, 'assets/temp/patch-notes-v0-03.md'), 'utf8')).toBe('# Version 0.03\n');
  }));

  test.each([
    ['patch-notes-v0-2.md', '# Version 0.02'],
    ['patch-notes-v0-02.md', '# Version 0.02'],
    ['patch-notes-v0-03.md', '# Wrong title'],
  ])('rejects %s without changing files', (name, content) => fixture((root) => {
    writeFileSync(resolve(root, 'assets/temp', name), content);
    const before = readFileSync(resolve(root, 'src/release.json'), 'utf8');
    expect(() => publishRelease(root, name)).toThrow();
    expect(readFileSync(resolve(root, 'src/release.json'), 'utf8')).toBe(before);
    expect(existsSync(resolve(root, 'assets/temp', name))).toBe(true);
  }));
});
