'use strict';

// Regression for #160 / #153: the glob/minimatch override graph must keep
// nested `**` wildcards working while minimatch stays on the patched major.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { globSync } = require('glob');

describe('glob + minimatch dependency graph', () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-glob-'));
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'top.js'), '');
    fs.writeFileSync(path.join(dir, 'a', 'mid.js'), '');
    fs.writeFileSync(path.join(dir, 'a', 'b', 'deep.js'), '');
    fs.writeFileSync(path.join(dir, 'a', 'b', 'skip.txt'), '');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('**/*.js returns nested matches', () => {
    const found = globSync('**/*.js', { cwd: dir }).map((p) => p.split(path.sep).join('/')).sort();
    expect(found).toEqual(['a/b/deep.js', 'a/mid.js', 'top.js']);
  });

  test('minimatch is at or above the patched 11.0.1 floor', () => {
    const [major, minor, patch] = require('minimatch/package.json').version.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(11);
    if (major === 11) expect(minor > 0 || patch >= 1).toBe(true);
  });
});
