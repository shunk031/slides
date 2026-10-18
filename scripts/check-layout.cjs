const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

// Measure rendered glyphs: nested lists and smaller inline citations have their own geometry.
function inspectLines() {
  const selector = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th';
  return [...document.querySelectorAll('section')].flatMap((slide, index) =>
    [...slide.querySelectorAll(selector)].map((block) => {
      const lines = [];
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest(selector) !== block) continue;
        let offset = 0;
        for (const char of node.textContent) {
          const range = document.createRange();
          range.setStart(node, offset);
          offset += char.length;
          range.setEnd(node, offset);
          if (!char.trim()) continue;
          const rect = range.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          let line = lines.find((l) => Math.min(l.bottom, rect.bottom) - Math.max(l.top, rect.top) > Math.min(l.bottom - l.top, rect.height) / 2);
          if (!line) {
            line = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, text: '' };
            lines.push(line);
          }
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
          line.text += char;
        }
      }
      const last = lines.at(-1);
      const ratio = lines.length > 1 ? (last.right - last.left) / Math.max(...lines.slice(0, -1).map(l => l.right - l.left)) : 1;
      // A review heuristic, not a verdict: short captions or deliberate breaks can be valid.
      const suspect = lines.length > 1 && ratio < 0.25;
      return { slide: index + 1, element: block.tagName.toLowerCase(), lines: lines.map(l => l.text), lastLineRatio: Number(ratio.toFixed(3)), suspect };
    }).filter(block => block.lines.length));
}

async function main() {
  const marpBin = process.env.PATH.split(path.delimiter).map(p => path.join(p, 'marp')).find(p => fs.existsSync(p));
  if (!marpBin) throw new Error('Run with mise: mise run check-layout');
  const marpRequire = createRequire(require.resolve('@marp-team/marp-cli', { paths: [path.dirname(marpBin)] }));
  const puppeteer = marpRequire('puppeteer-core');
  const { computeSystemExecutablePath, Browser, ChromeReleaseChannel } = marpRequire('@puppeteer/browsers');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || computeSystemExecutablePath({ browser: Browser.CHROME, channel: ChromeReleaseChannel.STABLE }),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    if (process.argv.includes('--self-test')) {
      await page.setContent('<section style="font:20px/1.5 monospace"><p>長い文章の視覚効果を<br>表現</p><p>同じ長さの文章<br>同じ長さの文章</p><ul><li>親の文章<ul><li>子の文章</li></ul></li></ul><p>本文<span style="font-size:12px">引用</span></p><p>一行だけ</p></section>');
      const result = await page.evaluate(inspectLines);
      assert.deepEqual(result.filter(r => r.suspect).map(r => r.lines.at(-1)), ['表現']);
      assert.deepEqual(result.filter(r => r.element === 'li').map(r => r.lines), [['親の文章'], ['子の文章']]);
      assert.deepEqual(result.find(r => r.lines.join('').includes('引用')).lines, ['本文引用']);
      console.log('Layout inspection self-test passed');
      return;
    }
    const files = process.argv.slice(2);
    if (!files.length) files.push(...fs.readdirSync('slides', { recursive: true }).filter(p => p.endsWith('.md')).map(p => path.join('slides', p)));
    if (!files.length) throw new Error('No Markdown slides found under slides/');
    let candidateCount = 0;
    for (const input of files) {
      const relative = path.relative(path.resolve('slides'), path.dirname(path.resolve(input)));
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Input must be under slides/');
      const output = path.resolve('dist', relative, `${path.parse(input).name}-review`);
      fs.mkdirSync(output, { recursive: true });
      const html = execFileSync('marp', ['--template', 'bare', input, '-o', '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      // Resolve assets exactly as in the input Markdown, not relative to dist/.
      const base = pathToFileURL(path.dirname(path.resolve(input)) + path.sep).href;
      const htmlPath = path.join(output, 'slides.html');
      fs.writeFileSync(htmlPath, html.replace('<head>', `<head><base href="${base}">`));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.decode()));
        const failed = [...document.fonts].filter(font => font.status === 'error');
        if (failed.length) throw new Error(`Font loading failed: ${failed.map(f => f.family).join(', ')}`);
        if (getComputedStyle(document.querySelector('section')).fontFamily.includes('LINE Seed JP') && ![...document.fonts].some(f => f.family.includes('LINE Seed JP') && f.status === 'loaded')) throw new Error('LINE Seed JP did not load');
      });
      const blocks = await page.evaluate(inspectLines);
      const candidates = blocks.filter(b => b.suspect);
      candidateCount += candidates.length;
      fs.writeFileSync(path.join(output, 'lines.json'), JSON.stringify({ input, browser: await browser.version(), blocks }, null, 2));
      await page.evaluate(() => document.querySelectorAll('.debug-layout').forEach(e => e.classList.remove('debug-layout')));
      const sections = await page.$$('section');
      if (!sections.length) throw new Error(`No slides rendered: ${input}`);
      const report = [`# Layout review: ${input}`, '', `${candidates.length} short-last-line candidates. Review each image at full size; zero candidates does not mean good layout.`, ''];
      for (let i = 0; i < sections.length; i++) {
        const filename = `slide-${i + 1}.png`;
        await sections[i].screenshot({ path: path.join(output, filename) });
        report.push(`## Slide ${i + 1}`, '', `![Slide ${i + 1}](${filename})`, '');
        for (const candidate of candidates.filter(c => c.slide === i + 1)) {
          report.push(`Review ${candidate.element}: last line is ${Math.round(candidate.lastLineRatio * 100)}% of the longest preceding line.`, '', '```text', ...candidate.lines, '```', '');
          console.log(`${input}:${i + 1} REVIEW short last line: ${candidate.lines.at(-1)}`);
        }
      }
      fs.writeFileSync(path.join(output, 'review.md'), report.join('\n'));
      console.log(`${sections.length} slides saved: ${path.join(output, 'review.md')}`);
    }
    console.log(`${candidateCount} candidates require visual review (not automatic failures).`);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
