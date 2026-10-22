const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function render(directives, body = '# Slide\n\n---\n\n# Next') {
  return spawnSync('marp', ['--output', '-'], {
    input: `---\nmarp: true\ntheme: ly\n${directives}\n---\n${body}\n`,
    encoding: 'utf8',
  });
}

for (const level of ['top-secret', 'secret', 'restricted', 'internal', 'public']) {
  const result = render(`class: classification-${level}`);
  assert.equal(result.status, 0, result.stderr);
}
assert.equal(render('class: lead').status, 0);
assert.equal(render('class: classification-public\n_class: lead classification-public').status, 0);

for (const [directives, body, message] of [
  ['class: classification-pubic', undefined, 'Unknown classification'],
  ['class: classification-public classification-secret', undefined, 'Multiple classifications'],
  ['class: classification-public classification-public', undefined, 'Multiple classifications'],
  ['class: classification-public\n_class: lead', undefined, 'Classification differs'],
  ['class: classification-public', '# Slide\n\n---\n<!-- _class: classification-secret -->\n# Next', 'Classification differs'],
  ['', '# Slide\n\n---\n<!-- _class: classification-pubic -->\n# Next', 'Unknown classification'],
]) {
  const result = render(directives, body);
  assert.notEqual(result.status, 0, `Expected failure: ${directives}`);
  assert.ok(result.stderr.includes(message), result.stderr);
}
console.log('Classification checks passed');
