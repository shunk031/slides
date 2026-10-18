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

function inspectStructure() {
  return [...document.querySelectorAll('section')].flatMap((slide, index) => {
    const findings = [];
    for (const link of slide.querySelectorAll('em > a')) {
      if ((link.textContent.match(/[\p{L}-]+\+/gu) || []).length > 1)
        findings.push({ slide: index + 1, kind: 'bundled-citation', text: link.textContent });
    }
    for (const block of slide.querySelectorAll('p,li')) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('p,li') !== block || node.parentElement.closest('a')) continue;
        for (const match of node.textContent.matchAll(/\bBLEU\b/g)) {
          let end = node;
          while (!end.nextSibling && end.parentElement !== block) end = end.parentElement;
          let next = end.nextSibling;
          while (next?.nodeType === Node.TEXT_NODE && !next.textContent.trim()) next = next.nextSibling;
          const link = next?.nodeType === Node.ELEMENT_NODE ? (next.matches('a') ? next : next.querySelector(':scope > a:only-child')) : null;
          if (node.textContent.slice(match.index + match[0].length).trim() || !link?.getAttribute('href') || !/\+.*[’']\d{2}/.test(link.textContent))
            findings.push({ slide: index + 1, kind: 'missing-metric-citation', text: block.textContent.trim() });
        }
      }
    }
    const figures = [...slide.querySelectorAll('blockquote:has(> p > img)')].filter(el => !el.matches('.profile-slide > blockquote:nth-of-type(2)'));
    const sources = [...slide.querySelectorAll('p')].filter(p => /^Figure from \[[^\]]+\]:\s*\S.*$/.test(p.textContent.trim()) && p.querySelector('a'));
    for (const p of slide.querySelectorAll('p')) {
      if (/^Figure from\b/.test(p.textContent.trim()) && !sources.includes(p))
        findings.push({ slide: index + 1, kind: 'figure-caption-missing', text: p.textContent.trim() });
      if (/^(出典|Source)\s*[:：]/i.test(p.textContent.trim()))
        findings.push({ slide: index + 1, kind: 'redundant-source', text: p.textContent.trim() });
    }
    const images = figures.flatMap(f => [...f.querySelectorAll('p > img')]).map(img => img.getBoundingClientRect()).filter(r => r.width && r.height);
    for (const source of sources) {
      const box = source.getBoundingClientRect();
      const style = getComputedStyle(source);
      const limit = 2 * (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5);
      const distance = Math.min(...images.map(r => Math.hypot(Math.max(r.left - box.right, box.left - r.right, 0), Math.max(r.top - box.bottom, box.top - r.bottom, 0))));
      if (images.length && distance > limit)
        findings.push({ slide: index + 1, kind: 'figure-source-gap', text: source.textContent.trim(), gap: Math.round(distance), limit: Math.round(limit) });
    }
    if (figures.length && !sources.length)
      findings.push({ slide: index + 1, kind: 'figure-source', text: 'Use Figure from [Author+ Venue’YY]: caption near the figure.' });
    for (const figure of figures) {
      for (const p of figure.querySelectorAll(':scope > p:not(:has(img))')) {
        if (p.querySelector('a') && !sources.includes(p))
          findings.push({ slide: index + 1, kind: 'figure-source', text: p.textContent.trim() });
      }
    }
    const bounds = slide.getBoundingClientRect();
    for (const el of slide.querySelectorAll('blockquote,img')) {
      const box = el.getBoundingClientRect();
      if (box.width && box.height && (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1))
        findings.push({ slide: index + 1, kind: 'box-overflow', text: el.textContent.trim() || el.getAttribute('alt') });
    }
    const heading = slide.querySelector(':scope > h2');
    if (heading && !slide.matches('.first-slide,.lead,.takahashi,.title-slide-big,.layout-example')) {
      const top = heading.getBoundingClientRect().bottom;
      const bottom = bounds.bottom - (parseFloat(getComputedStyle(slide).paddingBottom) || 0);
      const occupied = [...slide.querySelectorAll('p,li,td,th,img')].flatMap(el => {
        if (el.closest('header,footer')) return [];
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects(), ...(el.matches('img') ? [el.getBoundingClientRect()] : [])]
          .filter(r => r.width && r.height && r.top >= top).map(r => r.bottom);
      });
      const used = (Math.max(top, ...occupied) - top) / (bottom - top);
      if (bottom > top && used < 0.6)
        findings.push({ slide: index + 1, kind: 'sparse-body', text: `Content reaches only ${Math.round(used * 100)}% of the body height; redesign the page.` });
    }
    for (const block of slide.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th')) {
      const hasItems = ['grid', 'inline-grid', 'flex', 'inline-flex'].includes(getComputedStyle(block).display);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let overflow = false;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || node.parentElement.closest('h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th') !== block) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        let container = node.parentElement;
        while (container !== block && container.parentElement !== block) container = container.parentElement;
        // Grid/flex items can deliberately extend beyond an image-sized parent.
        const box = (hasItems ? container : block).getBoundingClientRect();
        overflow ||= [...range.getClientRects()].some(r => r.width && r.height && (
          r.left < Math.max(bounds.left, box.left) - 1 || r.right > Math.min(bounds.right, box.right) + 1 ||
          r.top < Math.max(bounds.top, box.top) - 1 || r.bottom > Math.min(bounds.bottom, box.bottom) + 1));
      }
      if (overflow) findings.push({ slide: index + 1, kind: 'text-overflow', text: block.textContent.trim() });
    }
    for (const block of slide.querySelectorAll('p,ul,ol')) {
      const previous = block.previousElementSibling;
      if (!previous?.matches('p,ul,ol') || block.closest('blockquote')?.querySelector('img')) continue;
      const style = getComputedStyle(block);
      const gap = block.getBoundingClientRect().top - previous.getBoundingClientRect().bottom;
      const expected = Math.max(parseFloat(style.marginTop) || 0, parseFloat(getComputedStyle(previous).marginBottom) || 0);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      if (gap > expected + lineHeight)
        findings.push({ slide: index + 1, kind: 'large-prose-gap', text: block.textContent.trim(), gap: Math.round(gap), expected: Math.round(expected) });
    }
    return findings;
  });
}

function inspectTypography() {
  const samples = [];
  const record = (role, el, slide, pseudo = null) => {
    if (el) samples.push({ role, slide, size: getComputedStyle(el, pseudo).fontSize, text: el.textContent.trim().slice(0, 60) });
  };
  [...document.querySelectorAll('section')].forEach((slide, index) => {
    if (slide.matches('.first-slide,.lead,.takahashi,.title-slide-big')) return;
    record('heading', slide.querySelector(':scope > h2'), index + 1);
    if (!slide.matches('.profile-slide')) record('heading-description', slide.querySelector(':scope > h2 > em:last-child'), index + 1);
    record('classification', slide, index + 1, '::before');
    record('pagination', slide, index + 1, '::after');
    for (const el of slide.querySelectorAll('p,li')) {
      if (el.querySelector('img,code') || el.closest('.profile-slide > blockquote:nth-of-type(2)')) continue;
      const figure = el.closest('blockquote:has(> p > img)');
      const nested = el.closest('li')?.parentElement.closest('li');
      const role = /^(Figure from|出典:)/.test(el.textContent.trim()) ? 'figure-source' : figure ? 'figure-caption' : nested ? 'nested-body' : 'body';
      record(role, el, index + 1);
      for (const inline of el.querySelectorAll(':scope > strong, :scope > a')) record(role, inline, index + 1);
    }
    for (const cite of slide.querySelectorAll('em > a')) record('citation', cite, index + 1);
  });
  const mismatched = new Set(samples.filter(a => samples.some(b => a.role === b.role && a.size !== b.size)).map(a => a.role));
  return samples.filter(s => mismatched.has(s.role)).map(s => ({ slide: s.slide, kind: 'font-size-mismatch', text: `${s.role}: ${s.size} (${s.text})` }));
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
      await page.setContent('<section style="font:20px/30px sans-serif"><div style="float:right;width:20px;height:200px"></div><p>A <em><a>Huang+ MM’22 / Hsiao+ NAACL’25</a></em></p><p style="clear:right">離れた節</p><p>A <em><a>Huang+ MM’22</a></em> / B <em><a>Hsiao+ NAACL’25</a></em></p><blockquote><p><img></p><p style="margin-top:90px">Figure from <a>[Author+ Venue’25]</a>: 図の説明</p></blockquote></section>');
      const structure = await page.evaluate(inspectStructure);
      assert.deepEqual(structure.map(f => f.kind), ['bundled-citation', 'large-prose-gap']);
      assert.equal(structure[1].text, '離れた節');
      await page.setContent('<section style="width:300px;height:120px;font:20px/30px sans-serif"><p style="width:80px;white-space:nowrap">Hsiao+ NAACL’25</p><p style="transform:translateY(100px)">下端のはみ出し</p><p style="height:5px">本文枠の下端</p></section>');
      assert.equal((await page.evaluate(inspectStructure)).filter(f => f.kind === 'text-overflow').length, 3);
      await page.setContent('<section style="width:300px;height:120px"><p style="display:grid;width:80px"><a style="width:max-content;white-space:nowrap">Intentional wide image caption</a></p></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section><blockquote><p><img></p><p>Figure 2 description <em><a>Huang+ ECCV’26</a></em></p></blockquote></section>');
      assert.equal((await page.evaluate(inspectStructure)).filter(f => f.kind === 'figure-source').length, 2);
      await page.setContent('<section><blockquote><p><img></p><p>Figure from <a>[Huang+ ECCV’26]</a>: 図の説明</p></blockquote></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section><p style="font-size:24px">本文</p><blockquote><p><img></p><p style="font-size:20px">図の説明</p></blockquote></section><section><p style="font-size:24px">本文</p><blockquote><p><img></p><p style="font-size:18px">図の説明</p></blockquote></section>');
      assert.deepEqual((await page.evaluate(inspectTypography)).map(f => f.slide), [1, 2]);
      await page.addStyleTag({ content: 'blockquote p {font-size:20px!important}' });
      assert.deepEqual(await page.evaluate(inspectTypography), []);
      await page.setContent('<section class="profile-slide"><blockquote><p>経歴</p></blockquote><blockquote><p><img></p><p><a>連絡先</a></p></blockquote></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section style="font:20px/30px sans-serif"><blockquote><p><img style="width:80px;height:40px"></p><p id="source" style="margin-top:90px">Figure from <a>[Huang+ ECCV’26]</a>: 説明</p></blockquote><p id="footer">出典: Huang+ ECCV’26</p></section>');
      assert.deepEqual((await page.evaluate(inspectStructure)).map(f => f.kind), ['redundant-source', 'figure-source-gap']);
      await page.evaluate(() => { document.querySelector('#footer').remove(); document.querySelector('#source').style.marginTop = '0'; });
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      for (const caption of ['Figure from <a>[Huang+ ECCV’26]</a>', 'Figure from <a>[Huang+ ECCV’26]</a>: ']) {
        await page.setContent(`<section><p>${caption}</p></section>`);
        assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'figure-caption-missing'), true);
      }
      await page.setContent('<section style="width:1280px;height:720px;padding-bottom:48px"><h2>比較</h2><p>文書・画面理解</p><p>デザイン生成</p><p id="last">本研究</p></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'sparse-body'), true);
      // A tall empty wrapper must not disguise sparse text.
      await page.addStyleTag({ content: 'p {height:100px}' });
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'sparse-body'), true);
      await page.addStyleTag({ content: '#last {margin-top:200px}' });
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'sparse-body'), false);
      await page.setContent('<section class="layout-example" style="height:720px"><h2>背景の見本</h2><p>クラス名</p></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'sparse-body'), false);
      await page.setContent('<section style="width:300px;height:100px"><blockquote style="height:160px">枠のはみ出し</blockquote></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'box-overflow'), true);
      for (const text of ['BLEU', 'BLEU（Bilingual Evaluation Understudy）', 'BLEU で比較 <em><a href="https://aclanthology.org/P02-1040/">Papineni+ ACL’02</a></em>']) {
        await page.setContent(`<section><p>${text}</p></section>`);
        assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'missing-metric-citation'), true);
      }
      await page.setContent('<section><p><strong>BLEU</strong> <em><a href="https://aclanthology.org/P02-1040/">Papineni+ ACL’02</a></em> で比較</p></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      console.log('Layout inspection self-test passed');
      return;
    }
    const files = process.argv.slice(2);
    if (!files.length) files.push(...fs.readdirSync('slides', { recursive: true }).filter(p => p.endsWith('.md')).map(p => path.join('slides', p)));
    if (!files.length) throw new Error('No Markdown slides found under slides/');
    let candidateCount = 0;
    let structuralErrors = 0;
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
      const structure = [...await page.evaluate(inspectStructure), ...await page.evaluate(inspectTypography)];
      structuralErrors += structure.filter(f => f.kind !== 'large-prose-gap').length;
      candidateCount += candidates.length + structure.length;
      fs.writeFileSync(path.join(output, 'lines.json'), JSON.stringify({ input, browser: await browser.version(), blocks, structure }, null, 2));
      await page.evaluate(() => document.querySelectorAll('.debug-layout').forEach(e => e.classList.remove('debug-layout')));
      const sections = await page.$$('section');
      if (!sections.length) throw new Error(`No slides rendered: ${input}`);
      const report = [`# Layout review: ${input}`, '', `${candidates.length} short-last-line candidates; ${structure.length} structure/typography findings. Review each image at full size; zero findings does not mean good layout.`, ''];
      for (let i = 0; i < sections.length; i++) {
        const filename = `slide-${i + 1}.png`;
        await sections[i].screenshot({ path: path.join(output, filename) });
        report.push(`## Slide ${i + 1}`, '', `![Slide ${i + 1}](${filename})`, '');
        for (const candidate of candidates.filter(c => c.slide === i + 1)) {
          report.push(`Review ${candidate.element}: last line is ${Math.round(candidate.lastLineRatio * 100)}% of the longest preceding line.`, '', '```text', ...candidate.lines, '```', '');
          console.log(`${input}:${i + 1} REVIEW short last line: ${candidate.lines.at(-1)}`);
        }
        for (const finding of structure.filter(f => f.slide === i + 1)) {
          const message = `${finding.kind}: ${finding.text}${finding.gap === undefined ? '' : ` (gap ${finding.gap}px, ${finding.limit === undefined ? `margin ${finding.expected}` : `limit ${finding.limit}`}px)`}`;
          report.push(`Review ${message}`, '');
          console.log(`${input}:${i + 1} REVIEW ${message}`);
        }
      }
      fs.writeFileSync(path.join(output, 'review.md'), report.join('\n'));
      console.log(`${sections.length} slides saved: ${path.join(output, 'review.md')}`);
    }
    console.log(`${candidateCount} findings require review; all structure/typography findings except large-prose-gap fail the check.`);
    if (structuralErrors) throw new Error(`${structuralErrors} structural/typography errors: see review.md.`);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
