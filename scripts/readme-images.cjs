const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const previews = [
  { theme: 'ly', input: 'slides/example/slides.md', titlePage: 1, bodyPage: 3 },
  { theme: 'uec-haralab', input: 'slides/example-uec-haralab/slides.md', titlePage: 1, bodyPage: 2 },
];
const outputRoot = 'docs/images/themes';
const manifestPath = path.join(outputRoot, 'manifest.json');
const renderInputs = [
  '.marprc.cjs',
  'mise.toml',
  'scripts/check-classification.cjs',
  'scripts/check-math.cjs',
  'scripts/check-layout.cjs',
  'scripts/parenthesis-supplements.cjs',
  'scripts/readme-images.cjs',
  'themes/assets',
];

function addFiles(target, files) {
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target).sort()) addFiles(path.join(target, entry), files);
  } else if (stat.isFile()) {
    files.add(target);
  }
}

function inputHashes() {
  const files = new Set(renderInputs);
  for (const preview of previews) {
    files.add(preview.input);
    files.add(`themes/${preview.theme}.css`);
    const assets = path.join(path.dirname(preview.input), 'assets');
    if (fs.existsSync(assets)) files.add(assets);
  }

  const expanded = new Set();
  for (const file of files) addFiles(file, expanded);
  return [...expanded].sort().map(file => ({ path: file, sha256: hashFile(file) }));
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function outputFiles() {
  return previews.flatMap(preview => [
    { path: `${outputRoot}/${preview.theme}/title.png`, source: reviewImage(preview, preview.titlePage) },
    { path: `${outputRoot}/${preview.theme}/body.png`, source: reviewImage(preview, preview.bodyPage) },
  ]).sort((a, b) => a.path.localeCompare(b.path));
}

function reviewImage(preview, page) {
  const slideDirectory = path.relative('slides', path.dirname(preview.input));
  const reviewDirectory = path.join('dist', slideDirectory, `${path.parse(preview.input).name}-review`);
  return path.join(reviewDirectory, `slide-${page}.png`);
}

function imageRecord(file) {
  const image = fs.readFileSync(file);
  if (image.length < 24 || image.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new Error(`${file} is not a PNG image`);
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== 1280 || height !== 720) {
    throw new Error(`${file} is ${width}x${height}; expected 1280x720`);
  }
  return { path: file, sha256: hashFile(file) };
}

function manifestContents() {
  return {
    version: 1,
    inputs: inputHashes(),
    outputs: outputFiles().map(({ path: file }) => imageRecord(file)),
  };
}

function write() {
  for (const { path: destination, source } of outputFiles()) {
    if (!fs.existsSync(source)) {
      throw new Error(`Missing ${source}; run mise run readme-images to render the sample slides`);
    }
    const image = imageRecord(source);
    const target = path.join(path.dirname(destination), path.basename(destination));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    console.log(`${source} → ${target} (${image.sha256.slice(0, 12)})`);
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifestContents(), null, 2)}\n`);
  console.log(`Wrote ${manifestPath}`);
}

function check() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}; run mise run readme-images to generate previews`);
  }
  const saved = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let current;
  try {
    current = manifestContents();
  } catch (error) {
    console.error(`README theme preview check failed: ${error.message}. Run mise run readme-images to regenerate previews.`);
    process.exitCode = 1;
    return;
  }
  if (JSON.stringify(saved) !== JSON.stringify(current)) {
    console.error('README theme previews are stale or changed. Run `mise run readme-images` to update the images and manifest.');
    process.exitCode = 1;
    return;
  }
  console.log('README theme preview images and input hashes are up to date.');
}

const mode = process.argv[2];
if (mode === '--write') write();
else if (mode === '--check') check();
else throw new Error('Usage: node scripts/readme-images.cjs --write|--check');
