const fs = require('node:fs');
const path = require('node:path');

// Keep example slides in scope; list any future exclusions here.
const excludedPaths = [];
// shortcut: scan single-line class directives, extend if decks adopt multiline YAML classes.
const debugClass = /^\s*(?:<!--\s*)?_?class\s*:.*(?<![\w-])debug-layout(?![\w-])/;
let failed = false;
for (const file of fs.readdirSync('slides', { recursive: true })) {
  const source = path.join('slides', file);
  if (!file.endsWith('.md') || excludedPaths.includes(source)) continue;
  fs.readFileSync(source, 'utf8').split(/\r?\n/).forEach((line, index) => {
    if (debugClass.test(line)) {
      console.error(`${source}:${index + 1}: remove debug-layout before merging`);
      failed = true;
    }
  });
}
process.exitCode = failed ? 1 : 0;
