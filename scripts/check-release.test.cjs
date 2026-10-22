const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'check-release-'));
try {
  fs.mkdirSync(path.join(cwd, 'slides/example'), { recursive: true });
  for (const [text, expected] of [
    ['<!-- _class: lead debug-layout -->', 1],
    ['class: "debug-layout classification-public"', 1],
    ['<!-- class: [lead, debug-layout] -->', 1],
    ['<!--\n_class: debug-layout\n-->', 1],
    ['<!-- _class: lead debug-layout-extra -->', 0],
    ['class: no-debug-layout', 0],
    ['The debug-layout class shows borders.', 0],
    ['<!-- _class: lead classification-public -->', 0],
  ]) {
    fs.writeFileSync(path.join(cwd, 'slides/example/slides.md'), text);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'check-release.cjs')], { cwd, encoding: 'utf8' });
    assert.equal(result.status, expected, `${text}\n${result.stderr}`);
    if (expected) assert.match(result.stderr, /slides\/example\/slides\.md:\d+: remove debug-layout/);
  }
  console.log('Release checks passed');
} finally {
  fs.rmSync(cwd, { recursive: true });
}
