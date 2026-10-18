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
    [...slide.querySelectorAll(selector)].flatMap((block) => {
      const regions = new Map();
      const separateItems = /^(inline-)?(flex|grid)$/.test(getComputedStyle(block).display);
      let explicitLine = 0;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches('br') && node.closest(selector) === block) explicitLine++;
          continue;
        }
        if (node.parentElement.closest(selector) !== block) continue;
        let region = node.parentElement;
        while (region !== block && region.parentElement !== block) region = region.parentElement;
        if (!separateItems) region = block;
        if (!regions.has(region)) regions.set(region, []);
        const lines = regions.get(region);
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
            line = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, text: '', explicitLines: new Set() };
            lines.push(line);
          }
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
          line.text += char;
          line.explicitLines.add(explicitLine);
        }
      }
      return [...regions.values()].filter(lines => lines.length).map(lines => {
        lines.sort((a, b) => a.top - b.top);
        const width = line => line.right - line.left;
        const shortest = lines.slice(2).reduce((min, line) => width(line) < width(min) ? line : min, lines[1] || lines[0]);
        const ratio = width(shortest) / Math.max(...lines.map(width));
        const heading = /^H[1-6]$/.test(block.tagName);
        const limit = heading ? 0.6 : 0.25;
        const explicitLines = lines.flatMap(line => [...line.explicitLines]);
        const softWrap = new Set(explicitLines).size < explicitLines.length;
        const boldHeading = block.tagName === 'P' && block.children.length === 1 && block.firstElementChild.matches('strong') && block.textContent.trim() === block.firstElementChild.textContent.trim();
        const headingWrap = block.tagName === 'TH' && lines.length > 1 ? 'table-header-wrap' : boldHeading && softWrap ? 'heading-soft-wrap' : null;
        return { slide: index + 1, element: block.tagName.toLowerCase(), text: block.textContent.trim(), lines: lines.map(l => l.text), headingWrap, multiLineTitle: block.tagName === 'H2' && block.parentElement === slide && lines.length > 1, shortLine: shortest.text, shortLineRatio: Number(ratio.toFixed(3)), limit, suspect: ratio < limit };
      });
    }).filter(block => block.lines.length));
}

function inspectMidwordWraps() {
  const selector = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th';
  const findings = [];
  const collect = block => {
    let text = '';
    const lines = [];
    const chars = [];
    const append = (char, rect) => {
      const start = text.length;
      text += char;
      if (!rect?.width || !rect.height) return;
      let line = lines.find(l => Math.min(l.bottom, rect.bottom) - Math.max(l.top, rect.top) > Math.min(l.bottom - l.top, rect.height) / 2);
      if (!line) {
        line = { top: rect.top, bottom: rect.bottom, text: '' };
        lines.push(line);
      }
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
      line.text += char;
      chars.push({ index: start, char, line });
    };
    const walk = node => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.parentElement.closest(selector) !== block) continue;
          let offset = 0;
          for (const char of child.textContent) {
            const range = document.createRange();
            range.setStart(child, offset);
            offset += char.length;
            range.setEnd(child, offset);
            append(char, range.getBoundingClientRect());
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.matches('br,wbr')) text += '\n';
          else if (child.matches('mjx-container,img')) append('\uFFFC', child.getBoundingClientRect());
          else if (!child.matches(selector)) walk(child);
        }
      }
    };
    walk(block);
    return { text, lines, chars };
  };
  for (const [index, slide] of [...document.querySelectorAll('section')].entries()) {
    const segmenter = new Intl.Segmenter(slide.lang || document.documentElement.lang || 'ja', { granularity: 'word' });
    for (const block of slide.querySelectorAll(selector)) {
      const actual = collect(block);
      if (!actual.chars.length) continue;
      const segments = [...segmenter.segment(actual.text.replace(/\uFFFC/g, ' '))].filter(segment => segment.isWordLike);
      for (let i = 1; i < actual.chars.length; i++) {
        const before = actual.chars[i - 1];
        const after = actual.chars[i];
        const boundary = before.index + before.char.length;
        if (before.line === after.line || actual.text.slice(boundary, after.index).includes('\n')) continue;
        const word = segments.find(segment => segment.index < boundary && boundary < segment.index + segment.segment.length);
        if (!word) continue;
        const splitWord = word.segment.replace(/\uFFFC/g, '').trim();
        findings.push({
          slide: index + 1,
          kind: 'midword-wrap',
          lines: [before.line.text.replace(/\uFFFC/g, '').trim(), after.line.text.replace(/\uFFFC/g, '').trim()],
          word: splitWord,
          text: `${before.line.text.replace(/\uFFFC/g, '').trim()} / ${after.line.text.replace(/\uFFFC/g, '').trim()} — split word: ${splitWord}`,
        });
      }
    }
  }
  return findings;
}

function inspectGroupGaps() {
  const sections = [...document.querySelectorAll('section')];
  const group = element => element && /^(P|UL|OL)$/.test(element.tagName) &&
    !(element.tagName === 'P' && element.children.length === 1 && element.firstElementChild.matches('strong'));
  const lastGroup = box => [...box.children].reverse().find(group);
  const themeGap = Math.max(...sections.map(section => parseFloat(getComputedStyle(section).getPropertyValue('--list-group-gap'))).filter(Number.isFinite));
  const groups = [];
  for (const [index, slide] of sections.entries()) {
    if (slide.matches('.profile-slide,.first-slide,.lead,.takahashi,.title-slide-big,.layout-example')) continue;
    for (const heading of slide.querySelectorAll('p')) {
      if (heading.children.length !== 1 || !heading.firstElementChild.matches('strong') || heading.closest('header,footer,blockquote:has(> p > img)')) continue;
      const next = heading.nextElementSibling;
      if (!group(next)) continue;
      let previous = heading.previousElementSibling;
      let crossesBox = false;
      if (!group(previous)) {
        const previousBox = heading.parentElement.previousElementSibling;
        if (!previousBox || previousBox.parentElement !== slide || previousBox.tagName !== 'BLOCKQUOTE' || previousBox.querySelector('img')) continue;
        const currentBox = heading.parentElement.getBoundingClientRect();
        const previousBoxRect = previousBox.getBoundingClientRect();
        if (previousBoxRect.right <= currentBox.left || currentBox.right <= previousBoxRect.left) continue;
        previous = lastGroup(previousBox);
        crossesBox = true;
      }
      if (!group(previous)) continue;
      const before = previous.getBoundingClientRect();
      const current = heading.getBoundingClientRect();
      if (!before.width || !current.width || before.bottom > current.top) continue;
      groups.push({
        slide: index + 1,
        role: `${heading.parentElement.tagName}:${previous.tagName}:${next.tagName}`,
        text: heading.textContent.trim(),
        previous: previous.tagName.toLowerCase(),
        next: next.tagName.toLowerCase(),
        gap: current.top - before.bottom,
        sectionGap: parseFloat(getComputedStyle(slide).getPropertyValue('--list-group-gap')),
        crossesBox,
      });
    }
  }
  return { themeGap, groups };
}

function groupGapFindings({ themeGap, groups }) {
  if (!Number.isFinite(themeGap)) return groups.map(group => ({ slide: group.slide, kind: 'group-gap-config', text: `${group.text}: --list-group-gap is not defined by the theme.` }));
  const medians = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  };
  return groups.flatMap(group => {
    if (!Number.isFinite(group.sectionGap))
      return [{ slide: group.slide, kind: 'group-gap-config', text: `${group.text}: --list-group-gap is not defined by the theme.` }];
    const peers = groups.filter(other => other.role === group.role);
    const pageGaps = new Map();
    for (const peer of peers) {
      if (!pageGaps.has(peer.slide)) pageGaps.set(peer.slide, []);
      pageGaps.get(peer.slide).push(peer.gap);
    }
    const roleMedian = Math.max(themeGap, medians([...pageGaps.values()].map(medians)));
    const pageMedian = medians(pageGaps.get(group.slide));
    const reasons = [];
    if (group.gap < themeGap) reasons.push(`gap ${Math.round(group.gap)}px is below the deck gap ${Math.round(themeGap)}px`);
    if (pageGaps.size > 1 && Math.abs(pageMedian - roleMedian) > 2) reasons.push(`same-role gap differs from the ${Math.round(roleMedian)}px page median by more than 2px`);
    return reasons.length ? [{
      slide: group.slide,
      kind: 'group-gap',
      gap: group.gap,
      limit: themeGap,
      text: `${group.text}: ${reasons.join('; ')}.`,
    }] : [];
  });
}

function inspectColumns() {
  const textSelector = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th';
  const firstText = block => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = [...range.getClientRects()].find(rect => rect.width && rect.height);
      if (!rect) continue;
      const owner = node.parentElement.closest(textSelector);
      return { top: rect.top, text: (owner?.textContent || node.textContent).trim() };
    }
    return null;
  };
  return [...document.querySelectorAll('section')].flatMap((slide, index) => {
    const slideTop = slide.getBoundingClientRect().top;
    const children = [...slide.children];
    const blocks = children.filter(block => !block.matches('header,footer') && block.textContent.trim()).map(block => {
      const first = firstText(block);
      const box = block.getBoundingClientRect();
      const imageTops = [...block.querySelectorAll('img')].map(img => img.getBoundingClientRect()).filter(rect => rect.width && rect.height).map(rect => rect.top);
      return first && box.width && box.height ? {
        block,
        box,
        first,
        order: children.indexOf(block),
        imageLeading: imageTops.some(top => top <= first.top),
        centered: getComputedStyle(block).alignSelf === 'center',
      } : null;
    }).filter(Boolean);
    const imageLeadsColumn = item => item.imageLeading || children.slice(0, item.order).some(previous => {
      const previousBox = previous.getBoundingClientRect();
      const previousImages = [...previous.querySelectorAll('img')].map(img => img.getBoundingClientRect()).filter(rect => rect.width && rect.height);
      return previousImages.length && previousBox.bottom <= item.box.top + 2 &&
        Math.abs((previousBox.left + previousBox.right) / 2 - (item.box.left + item.box.right) / 2) <= 2;
    });
    const pairs = [];
    for (let i = 0; i < blocks.length; i++) {
      for (const right of blocks.slice(i + 1)) {
        const left = blocks[i];
        if (Math.min(left.box.bottom, right.box.bottom) <= Math.max(left.box.top, right.box.top)) continue;
        const [first, second] = left.box.left <= right.box.left ? [left, right] : [right, left];
        if (first.box.right > second.box.left) continue;
        pairs.push({
          slide: index + 1,
          leftText: first.first.text,
          rightText: second.first.text,
          leftTop: first.first.top - slideTop,
          rightTop: second.first.top - slideTop,
          difference: Math.abs(first.first.top - second.first.top),
          imageLeading: imageLeadsColumn(left) || imageLeadsColumn(right),
          centered: left.centered || right.centered,
        });
      }
    }
    return pairs;
  });
}

function columnFindings(columns) {
  return columns.filter(pair => !pair.imageLeading && !pair.centered && pair.difference > 2).map(pair => ({
    slide: pair.slide,
    kind: 'column-alignment',
    text: `${pair.leftText} (${Math.round(pair.leftTop)}px) / ${pair.rightText} (${Math.round(pair.rightTop)}px)`,
    leftTop: pair.leftTop,
    rightTop: pair.rightTop,
  }));
}

function inspectBodyFill() {
  const bottomOf = elements => Math.max(-Infinity, ...elements.flatMap(element => {
    const images = [...element.querySelectorAll('img,mjx-container'), ...(element.matches('img,mjx-container') ? [element] : [])];
    const bottoms = images.map(el => el.getBoundingClientRect()).filter(r => r.width && r.height).map(r => r.bottom);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      bottoms.push(...[...range.getClientRects()].filter(r => r.width && r.height).map(r => r.bottom));
    }
    return bottoms;
  }));
  return [...document.querySelectorAll('section')].flatMap((slide, index) => {
    const heading = slide.querySelector(':scope > h2');
    if (!heading) return [];
    const bounds = slide.getBoundingClientRect();
    const top = heading.getBoundingClientRect().bottom;
    const bottom = bounds.bottom - (parseFloat(getComputedStyle(slide).paddingBottom) || 0);
    const excluded = slide.matches('.first-slide,.lead,.takahashi,.title-slide-big,.layout-example');
    const children = [...slide.children].filter(el => !el.matches('h1,h2,header,footer,.pagination,.page-number,.classification,.classification-badge,.background-decoration'));
    const region = (scope, elements, start, end, limit) => {
      const contentBottom = Math.max(start, bottomOf(elements));
      return { slide: index + 1, scope, text: elements.map(el => el.textContent.trim() || el.getAttribute('alt') || '').join(' ').slice(0, 120), top: start - bounds.top, bottom: end - bounds.top, contentBottom: contentBottom - bounds.top, used: end > start ? (contentBottom - start) / (end - start) : 1, limit, excluded };
    };
    const regions = [region('body', children, top, bottom, 0.75)];
    if (excluded) return regions;
    const boxes = children.map(element => ({ element, box: element.getBoundingClientRect() })).filter(({ element, box }) => box.width && box.height && box.top >= top && (element.textContent.trim() || element.querySelector('img,mjx-container')));
    const seen = new Set();
    for (let i = 0; i < boxes.length; i++) {
      for (const other of boxes.slice(i + 1)) {
        const item = boxes[i];
        if (Math.min(item.box.bottom, other.box.bottom) <= Math.max(item.box.top, other.box.top) || Math.min(item.box.right, other.box.right) > Math.max(item.box.left, other.box.left)) continue;
        const shared = boxes.filter(candidate => candidate.box.left <= Math.min(item.box.left, other.box.left) + 2 && candidate.box.right >= Math.max(item.box.right, other.box.right) - 2);
        const start = Math.max(top, ...shared.filter(candidate => candidate.box.bottom <= Math.min(item.box.top, other.box.top) + 2).map(candidate => candidate.box.bottom));
        const end = Math.min(bottom, ...shared.filter(candidate => candidate.box.top >= Math.max(item.box.top, other.box.top) + 2).map(candidate => candidate.box.top));
        for (const column of [item, other]) {
          const key = `${Math.round(column.box.left)}:${Math.round(column.box.right)}:${start}:${end}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const elements = boxes.filter(candidate => Math.abs(candidate.box.left - column.box.left) <= 2 && Math.abs(candidate.box.right - column.box.right) <= 2 && candidate.box.top >= start - 2 && candidate.box.top < end).map(candidate => candidate.element);
          regions.push(region('column', elements, start, end, 0.6));
        }
      }
    }
    return regions;
  });
}

function bodyFillFindings(regions) {
  return regions.filter(region => !region.excluded && region.used < region.limit).map(region => ({ ...region, kind: 'sparse-body', text: `${region.scope}: content reaches ${Math.round(region.used * 100)}% of the available height (minimum ${Math.round(region.limit * 100)}%); ${region.text}` }));
}

function inspectStructure() {
  return [...document.querySelectorAll('section')].flatMap((slide, index) => {
    const findings = [];
    if (slide.matches('.paired-definitions')) {
      const definitions = [...slide.querySelectorAll(':scope > blockquote:nth-of-type(-n + 2) > p:first-child')];
      if (definitions.length !== 2) findings.push({ slide: index + 1, kind: 'paired-definition-alignment', text: 'Expected two definition paragraphs.' });
      else {
        const boxes = definitions.map(p => p.getBoundingClientRect());
        if (Math.abs(boxes[0].height - boxes[1].height) > 2)
          findings.push({ slide: index + 1, kind: 'paired-definition-alignment', text: `Definition heights differ: ${Math.round(boxes[0].height)}px vs. ${Math.round(boxes[1].height)}px.` });
      }
    }
    for (const link of slide.querySelectorAll('a')) {
      if (/[’']\d{2}/.test(link.textContent)) {
        const block = link.closest('p,li,figcaption,td,th') || link.parentElement;
        const before = document.createRange();
        before.selectNodeContents(block);
        before.setEndBefore(link);
        const after = document.createRange();
        after.selectNodeContents(block);
        after.setStartAfter(link);
        if (/[\[\]]/.test(link.textContent))
          findings.push({ slide: index + 1, kind: 'linked-citation-bracket', text: link.textContent });
        else if (!/\[[^\[\]]*$/.test(before.toString()) || !/^[^\[\]]*\]/.test(after.toString()))
          findings.push({ slide: index + 1, kind: 'unbracketed-citation', text: link.textContent });
      }
      if ((link.textContent.match(/[\p{L}-]+\+/gu) || []).length > 1)
        findings.push({ slide: index + 1, kind: 'bundled-citation', text: link.textContent });
    }
    for (const block of slide.querySelectorAll('p,li')) {
      const directText = [...block.childNodes]
        .filter(node => node.nodeType !== Node.ELEMENT_NODE || !node.matches('ul,ol'))
        .map(node => node.textContent).join('').trim();
      if (/(?<![がは])必要[。．]*$/u.test(directText))
        findings.push({ slide: index + 1, kind: 'incomplete-necessity', text: directText });
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('p,li') !== block || node.parentElement.closest('a')) continue;
        for (const match of node.textContent.matchAll(/\bBLEU\b/g)) {
          let end = node;
          while (!end.nextSibling && end.parentElement !== block) end = end.parentElement;
          let next = end.nextSibling;
          while (next?.nodeType === Node.TEXT_NODE && /^\s*\[?\s*$/.test(next.textContent)) next = next.nextSibling;
          const link = next?.nodeType === Node.ELEMENT_NODE ? (next.matches('a') ? next : next.querySelector(':scope > a:only-child')) : null;
          if (!/^\s*\[?\s*$/.test(node.textContent.slice(match.index + match[0].length)) || !link?.getAttribute('href') || !/\+.*[’']\d{2}/.test(link.textContent))
            findings.push({ slide: index + 1, kind: 'missing-metric-citation', text: block.textContent.trim() });
        }
      }
    }
    const figures = [...slide.querySelectorAll('blockquote:has(> p > img)')].filter(el => !el.matches('.profile-slide > blockquote:nth-of-type(2)'));
    const sources = [...slide.querySelectorAll('p')].filter(p => /^Figure from \[[^\]]+\]:\s*\S.*$/s.test(p.textContent.trim()) && p.querySelector('a'));
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
    const axisText = text => text.replace(/\s+/g, '').toLowerCase();
    const horizontalAxis = /(?:横軸|x軸)/i;
    const verticalAxis = /(?:(?:左|右)?縦軸|y軸)/i;
    const axisBlocks = [...slide.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th')]
      .filter(block => !block.querySelector('h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th') && /(?:横軸|(?:(?:左|右)?縦軸)|[xy]軸)/i.test(axisText(block.textContent)));
    const captionFigures = figures.filter(figure => sources.some(source => figure.contains(source)));
    const captionSources = sources.filter(source => !captionFigures.some(figure => figure.contains(source)));
    for (const block of axisBlocks) {
      const figure = block.closest('blockquote');
      const caption = captionFigures.includes(figure) ? figure : (sources.includes(block.closest('p')) ? block.closest('p') : null);
      if (!caption) findings.push({ slide: index + 1, kind: 'axis-outside-figure-caption', text: block.textContent.trim() });
    }
    for (const caption of [...captionFigures, ...captionSources]) {
      const value = axisText(caption.textContent);
      const hasHorizontal = horizontalAxis.test(value);
      const hasVertical = verticalAxis.test(value);
      if ((hasHorizontal || hasVertical) && !(hasHorizontal && hasVertical))
        findings.push({ slide: index + 1, kind: 'axis-pair-missing', text: `${caption.textContent.trim()} — keep horizontal and vertical axis descriptions in this caption.` });
    }
    const bounds = slide.getBoundingClientRect();
    for (const el of slide.querySelectorAll('blockquote,img')) {
      const box = el.getBoundingClientRect();
      if (box.width && box.height && (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1))
        findings.push({ slide: index + 1, kind: 'box-overflow', text: el.textContent.trim() || el.getAttribute('alt') });
    }
    // MathJax renders display formulas as SVG, so text ranges miss their visual extent.
    const contentBottom = bounds.bottom - (parseFloat(getComputedStyle(slide).paddingBottom) || 0);
    for (const math of slide.querySelectorAll('mjx-container.MathJax[display="true"]')) {
      if (math.getBoundingClientRect().bottom > contentBottom + 1)
        findings.push({ slide: index + 1, kind: 'math-overflow', text: 'Display formula extends below the content area.' });
    }
    const footer = slide.querySelector(':scope > footer');
    if (footer) {
      const slideTop = bounds.top;
      const footerTop = footer.getBoundingClientRect().top - slideTop;
      for (const block of slide.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th,img')) {
        if (block.closest('header,footer,.pagination,.page-number,.classification,.classification-badge,.background-decoration')) continue;
        const box = block.getBoundingClientRect();
        const bodyBottom = box.bottom - slideTop;
        if (box.width && box.height && bodyBottom >= footerTop)
          findings.push({ slide: index + 1, kind: 'footer-overflow', text: `${block.textContent.trim() || block.getAttribute('alt') || ''} (body bottom ${Math.round(bodyBottom)}px, footer top ${Math.round(footerTop)}px)`, bodyBottom, footerTop });
      }
    }
    const textRuns = [];
    const textBlocks = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th,header,footer';
    for (const block of slide.querySelectorAll(textBlocks)) {
      const hasItems = ['grid', 'inline-grid', 'flex', 'inline-flex'].includes(getComputedStyle(block).display);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let overflow = false;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || node.parentElement.closest(textBlocks) !== block) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          if (rect.width && rect.height) textRuns.push({ block, rect });
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
    const overlapping = new Set();
    for (let i = 0; i < textRuns.length; i++) {
      const a = textRuns[i];
      for (const b of textRuns.slice(i + 1)) {
        if (a.block === b.block) continue;
        if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 2 &&
            Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 2) {
          overlapping.add(a.block);
          overlapping.add(b.block);
        }
      }
    }
    for (const block of overlapping)
      findings.push({ slide: index + 1, kind: 'text-overlap', text: block.textContent.trim() });
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

function inspectTerms(terms) {
  const normalize = text => text.replace(/\s+/g, '').replace(/：/g, ':').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
  const found = new Set();
  const findings = [...document.querySelectorAll('section')].flatMap((slide, index) => {
    const findings = [];
    for (const block of slide.querySelectorAll('h1,h2,h3,p,li')) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let text = '';
      while (walker.nextNode()) {
        if (walker.currentNode.parentElement.closest('h1,h2,h3,p,li') === block)
          text += walker.currentNode.textContent;
      }
      const value = normalize(text);
      for (const [term, definition] of Object.entries(terms)) {
        const name = normalize(term);
        const expected = normalize(definition);
        const direct = value.startsWith(`${name}:`);
        const parenthetical = value.startsWith(`${name}(`);
        const problem = value.startsWith('解決する問題:') && value.endsWith(`(${name})`);
        if (direct || parenthetical || problem) {
          const gloss = parenthetical ? value.slice(name.length + 1, value.indexOf(')', name.length + 1)) : null;
          if ((direct && value.slice(name.length + 1) === expected) ||
              (parenthetical && gloss === expected) ||
              (problem && value === `解決する問題:${expected}(${name})`)) found.add(term);
          else findings.push({ slide: index + 1, kind: 'inconsistent-term-definition', text: `${text.trim()} — expected ${term}: ${definition}` });
        }
      }
    }
    return findings;
  });
  return [...findings, ...Object.entries(terms).filter(([term]) => !found.has(term)).map(([term, definition]) =>
    ({ slide: 0, kind: 'missing-term-definition', text: `${term}: ${definition}` }))];
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
      const terms = { 'Semantic drift': 'メタデータと画像中の見た目の不一致' };
      for (const text of ['Semantic drift: 要素対応のずれ', 'Semantic drift（メタデータと画像の見た目のずれ）', '解決する問題: 要素の取り違え（Semantic drift）']) {
        await page.setContent(`<section><p>${text}</p></section>`);
        assert.equal((await page.evaluate(inspectTerms, terms))[0].kind, 'inconsistent-term-definition');
      }
      for (const text of ['<strong>Semantic drift:</strong> メタデータと画像中の<br>見た目の不一致', 'Semantic drift（メタデータと画像中の見た目の不一致）', '解決する問題: メタデータと画像中の見た目の不一致（Semantic drift）']) {
        await page.setContent(`<section><p>${text}</p></section>`);
        assert.deepEqual(await page.evaluate(inspectTerms, terms), []);
      }
      for (const text of ['Semantic drift', '重なって隠れた指定要素を見失う']) {
        await page.setContent(`<section><p>${text}</p></section>`);
        assert.equal((await page.evaluate(inspectTerms, terms))[0].kind, 'missing-term-definition');
      }
      const contrastTerms = { 'Atomic layout': '独立した要素として扱う', 'Compositional layout': '複数レイヤーを組み合わせる' };
      await page.setContent('<section><h2>Atomic layout から Compositional layout へ</h2><p>Compositional layout: 複数レイヤーを組み合わせる</p></section>');
      assert.deepEqual((await page.evaluate(inspectTerms, contrastTerms)).map(f => f.text), ['Atomic layout: 独立した要素として扱う']);
      await page.setContent('<section><p>Atomic layout: 独立した要素として扱う</p><p>Compositional layout: 複数レイヤーを組み合わせる</p></section>');
      assert.deepEqual(await page.evaluate(inspectTerms, contrastTerms), []);
      // Measure the subtitle independently from its larger, vertically centered title.
      await page.setContent('<section><h2 style="display:flex;align-items:center;font:48px monospace">Title <em style="font:20px monospace;width:240px;flex:none;word-break:break-all">ABCDEFGHIJKLMNOPQRST<br>ABCD</em></h2></section>');
      assert.equal((await page.evaluate(inspectLines)).some(r => r.element === 'h2' && r.suspect), true);
      assert.equal((await page.evaluate(inspectLines)).some(r => r.multiLineTitle), true);
      await page.setContent('<section><h2 style="white-space:nowrap">A deliberately long heading that stays on one line</h2></section>');
      assert.equal((await page.evaluate(inspectLines)).some(r => r.multiLineTitle), false);
      for (const content of ['<p><strong>Heading wraps</strong></p>', '<p><strong>First<br>Heading wraps</strong></p>', '<table><tr><th>Heading wraps</th></tr></table>', '<table><tr><th>A<br>B</th></tr></table>']) {
        await page.setContent(`<section style="width:90px;font:20px/30px monospace">${content}</section>`);
        assert.ok((await page.evaluate(inspectLines)).some(r => r.headingWrap));
      }
      for (const content of ['<p><strong>First<br>Second</strong></p>', '<p><strong>Heading</strong></p>', '<table><tr><th>Header</th></tr></table>', '<p>Heading wraps</p>']) {
        await page.setContent(`<section style="width:90px;font:20px/30px monospace">${content}</section>`);
        assert.equal((await page.evaluate(inspectLines)).some(r => r.headingWrap), false);
      }
      await page.setContent('<section><h2 style="display:flex;align-items:center;font:48px monospace">Title <em style="font:20px monospace">ABCDEFGHIJKL<br>ABCDEFGHIJ</em></h2></section>');
      assert.equal((await page.evaluate(inspectLines)).some(r => r.suspect), false);
      await page.setContent('<section><h2 style="display:flex;align-items:center;font:48px monospace">Title <em id="subtitle" style="font:20px monospace;min-width:0;flex:none;word-break:break-all">ABCDEFGHIJKLMNOPQRSTUVWX</em></h2></section>');
      await page.evaluate(() => {
        const subtitle = document.querySelector('#subtitle');
        const range = document.createRange();
        range.selectNodeContents(subtitle);
        subtitle.style.width = `${range.getBoundingClientRect().width * 0.85}px`;
      });
      assert.equal((await page.evaluate(inspectLines)).some(r => r.suspect), true);
      await page.setContent('<section lang="ja" style="font:20px/30px sans-serif;word-break:auto-phrase;text-wrap:pretty"><p id="p3" style="width:80px;margin:0">「意図どおり」に直す</p></section>');
      const p3Legacy = await page.evaluate(inspectLines);
      const p3Wraps = await page.evaluate(inspectMidwordWraps);
      console.log(`P3 baseline: legacy line-balance=${p3Legacy.some(r => r.suspect)}; lines=${JSON.stringify(p3Legacy.map(r => r.lines))}; mid-word=${JSON.stringify(p3Wraps)}`);
      assert.equal(p3Legacy.some(r => r.suspect), false);
      assert.ok(p3Wraps.some(r => r.word === 'どおり'));
      assert.deepEqual([...new Intl.Segmenter('ja', { granularity: 'word' }).segment('意図どおり')].filter(s => s.isWordLike).map(s => s.segment), ['意図', 'どおり']);
      await page.setContent('<section lang="ja" style="font:20px/30px sans-serif;word-break:auto-phrase;text-wrap:pretty"><p style="width:70px;margin:0">意図 どおり</p></section>');
      assert.deepEqual(await page.evaluate(inspectMidwordWraps), []);
      await page.setContent('<section style="font:20px monospace"><p style="width:80px;margin:0;word-break:break-all">ABCDEFGHIJKL</p></section>');
      assert.ok((await page.evaluate(inspectMidwordWraps)).some(r => r.word === 'ABCDEFGHIJKL'));
      await page.setContent('<section style="font:20px monospace"><p style="width:80px;margin:0;word-break:break-all">ABC<a>DEFGHI</a><mjx-container class="MathJax" style="display:inline-block;width:16px;height:20px"><svg width="16" height="20"></svg></mjx-container></p></section>');
      assert.ok((await page.evaluate(inspectMidwordWraps)).some(r => r.word === 'ABCDEFGHI'));
      await page.setContent('<section style="font:20px monospace"><p style="width:80px;margin:0;word-break:break-all"><code>ABCDEFGHIJKL</code></p></section>');
      assert.ok((await page.evaluate(inspectMidwordWraps)).some(r => r.word === 'ABCDEFGHIJKL'));
      await page.setContent('<section lang="ja" style="font:20px/30px sans-serif;word-break:auto-phrase;text-wrap:pretty"><p style="margin:0">デザインを「作る」だけでなく<br>「意図どおりに直す」ことが難しい</p></section>');
      assert.deepEqual(await page.evaluate(inspectMidwordWraps), []);
      await page.setContent('<section style="font:20px/20px monospace;--list-group-gap:16px"><blockquote style="position:absolute;top:20px;left:0;margin:0"><ul style="margin:0;padding:0"><li style="margin:0;list-style:none">Previous</li></ul></blockquote><blockquote style="position:absolute;top:44px;left:0;margin:0"><p style="margin:0"><strong>Group</strong></p><ul style="margin:0;padding:0"><li style="margin:0;list-style:none">Next</li></ul></blockquote></section>');
      const shortGroupGap = groupGapFindings(await page.evaluate(inspectGroupGaps));
      assert.ok(shortGroupGap.some(f => f.kind === 'group-gap' && f.gap === 4));
      await page.evaluate(() => { document.querySelectorAll('blockquote')[1].style.top = '56px'; });
      assert.deepEqual(groupGapFindings(await page.evaluate(inspectGroupGaps)), []);
      await page.evaluate(() => {
        document.querySelector('section').style.setProperty('--list-group-gap', '8px');
        document.querySelectorAll('blockquote')[1].style.top = '48px';
        document.body.insertAdjacentHTML('beforeend', '<section style="--list-group-gap:16px"></section>');
      });
      assert.ok(groupGapFindings(await page.evaluate(inspectGroupGaps)).some(f => f.kind === 'group-gap' && f.gap === 8 && f.limit === 16));
      await page.evaluate(() => { document.querySelectorAll('blockquote')[1].style.top = '56px'; });
      assert.deepEqual(groupGapFindings(await page.evaluate(inspectGroupGaps)), []);
      await page.setContent('<section style="font:20px/20px monospace;--list-group-gap:16px"><h2>Title</h2><p style="margin:0"><strong>Group</strong></p><ul style="margin:0"><li>Next</li></ul></section>');
      assert.deepEqual((await page.evaluate(inspectGroupGaps)).groups, []);
      assert.ok(groupGapFindings({ themeGap: 16, groups: [
        { slide: 1, role: 'body-group-heading', text: 'A', gap: 16, sectionGap: 16 },
        { slide: 2, role: 'body-group-heading', text: 'B', gap: 22, sectionGap: 16 },
      ] }).length);
      assert.ok(groupGapFindings({ themeGap: 16, groups: [
        { slide: 1, role: 'body-group-heading', text: 'A', gap: 16, sectionGap: 16 },
        { slide: 2, role: 'body-group-heading', text: 'B', gap: 22, sectionGap: 8 },
      ] }).some(f => f.text.includes('same-role gap')));
      assert.deepEqual(groupGapFindings({ themeGap: 16, groups: [16, 8, 8, 8].map((gap, index) => ({
        slide: index + 1, role: 'body-group-heading', text: 'Group', gap, sectionGap: gap,
      })) }).map(f => f.slide), [2, 3, 4]);
      for (const tag of ['p', 'li', 'td']) {
        const content = tag === 'td' ? '<table><tr><td>Long first line<br>x</td></tr></table>' : `<${tag}>Long first line<br>x</${tag}>`;
        await page.setContent(`<section style="font:20px monospace">${content}</section>`);
        assert.equal((await page.evaluate(inspectLines)).some(r => r.suspect), true);
      }
      await page.setContent('<section style="position:relative;width:500px;height:300px;font:20px/30px monospace"><p style="position:absolute;top:220px;margin:0">Body text</p><footer style="position:absolute;top:220px">Footer</footer></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'text-overlap'), true);
      await page.addStyleTag({content:'footer {top:260px!important}'});
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'text-overlap'), false);
      await page.setContent('<section style="position:relative;width:500px;height:300px"><p style="position:absolute;top:20px">First</p><p style="position:absolute;top:20px">Second</p></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'text-overlap'), true);
      await page.setContent('<section style="position:relative;width:500px;height:300px;font:20px/20px monospace"><p style="position:absolute;top:240px;height:20px;margin:0">Touches footer</p><footer style="position:absolute;top:260px;height:20px">Footer</footer></section>');
      const footerTouch = (await page.evaluate(inspectStructure)).find(f => f.kind === 'footer-overflow');
      assert.equal(footerTouch.bodyBottom, 260);
      assert.equal(footerTouch.footerTop, 260);
      await page.evaluate(() => { document.querySelector('p').style.top = '239px'; });
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'footer-overflow'), false);
      await page.setContent('<section class="paired-definitions" style="display:grid;grid-template-columns:1fr 1fr;font:20px/30px sans-serif"><blockquote style="margin:0"><p style="margin:0">Atomic<br>layout<br>definition</p></blockquote><blockquote style="margin:0"><p style="margin:0">Compositional<br>layout</p></blockquote></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'paired-definition-alignment'), true);
      await page.setContent('<section class="paired-definitions" style="display:grid;grid-template-columns:1fr 1fr;font:20px/30px sans-serif"><blockquote style="margin:8px 0 0"><p style="margin:0">Atomic<br>layout</p></blockquote><blockquote style="margin:0"><p style="margin:0">Compositional<br>layout</p></blockquote></section>');
      assert.equal(columnFindings(await page.evaluate(inspectColumns)).some(f => f.kind === 'column-alignment'), true);
      await page.setContent('<section class="paired-definitions" style="display:grid;grid-template-columns:1fr 1fr;font:20px/30px sans-serif"><blockquote style="margin:0"><p style="margin:0">Atomic<br>layout</p></blockquote><blockquote style="margin:0"><p style="margin:0">Compositional<br>layout</p></blockquote></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'paired-definition-alignment'), false);
      for (const [name, top] of [['P4 prior 5px offset', 5], ['P16 10px offset', 10]]) {
        await page.setContent(`<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/30px monospace"><blockquote style="margin:0">Left heading</blockquote><blockquote style="margin:${top}px 0 0">Right heading</blockquote></section>`);
        assert.equal(columnFindings(await page.evaluate(inspectColumns)).some(f => f.kind === 'column-alignment'), true, name);
      }
      await page.setContent('<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/20px monospace"><blockquote style="grid-column:1;grid-row:1;margin:0"><p style="margin:0"><img alt="" style="width:80px;height:40px"></p></blockquote><blockquote style="grid-column:1;grid-row:2;margin:0">Left below figure</blockquote><blockquote style="grid-column:2;grid-row:1 / span 2;margin:0">Right column<br>continues<br>below</blockquote></section>');
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.setContent('<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/20px monospace"><blockquote style="margin:0">Left column</blockquote><blockquote style="margin:0;align-self:center">Centered note</blockquote></section>');
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.setContent('<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/30px monospace"><blockquote style="margin:0">Left heading</blockquote><blockquote style="margin:0">Right heading</blockquote></section>');
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.setContent('<section style="font:20px/30px monospace"><blockquote style="margin:0">One column</blockquote></section>');
      assert.deepEqual(await page.evaluate(inspectColumns), []);
      for (const text of ['関連レイヤーを見つける必要', '関連レイヤーを確認する必要']) {
        await page.setContent(`<section><ul><li>${text}</li></ul></section>`);
        assert.equal((await page.evaluate(inspectStructure)).filter(f => f.kind === 'incomplete-necessity').length, 1);
      }
      for (const text of ['関連レイヤーを見つける必要あり', '関連レイヤーを見つける必要がある', '意味の置き換えが必要']) {
        await page.setContent(`<section><ul><li>${text}</li></ul></section>`);
        assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'incomplete-necessity'), false);
      }
      const { Marp } = marpRequire('@marp-team/marp-core');
      const math = new Marp().use(require('./check-math.cjs'));
      for (const tex of [
        String.raw`\underbrace{x}_{\text{label}}`,
        String.raw`\underbrace{\mathclap{x}}_{label}`,
        String.raw`\underbrace{x}_{\mathclap{a}b}`,
        String.raw`\underbrace{x}`,
        String.raw`\underbrace{\underbrace{x}_{bad}}_{\mathclap{ok}}`,
      ]) {
        for (const source of [`$${tex}$`, `$$\n${tex}\n$$`])
          assert.throws(() => math.render(source), /underbrace-mathclap/);
      }
      for (const tex of [
        String.raw`\underbrace{x}_{\mathclap{\text{label}}}`,
        String.raw`\underbrace{\colorbox{red}{$x$}} _ { \mathclap{\text{label}} }`,
        String.raw`\underbrace{\{x\}}_{\mathclap{label}}`,
        String.raw`\underbrace{\underbrace{x}_{\mathclap{inner}}}_{\mathclap{outer}}`,
      ]) assert.doesNotThrow(() => math.render(`$$\n${tex}\n$$`));
      assert.doesNotThrow(() => math.render('`\\underbrace{x}_{label}`\n\n```tex\n\\underbrace{x}_{label}\n```'));

      await page.setContent('<section style="font:20px/1.5 monospace"><p>長い文章の視覚効果を<br>表現</p><p>同じ長さの文章<br>同じ長さの文章</p><ul><li>親の文章<ul><li>子の文章</li></ul></li></ul><p>本文<span style="font-size:12px">引用</span></p><p>一行だけ</p></section>');
      const result = await page.evaluate(inspectLines);
      assert.deepEqual(result.filter(r => r.suspect).map(r => r.lines.at(-1)), ['表現']);
      assert.deepEqual(result.filter(r => r.element === 'li').map(r => r.lines), [['親の文章'], ['子の文章']]);
      assert.deepEqual(result.find(r => r.lines.join('').includes('引用')).lines, ['本文引用']);
      await page.setContent('<section style="font:20px monospace"><p>長い文章の視覚効果をデザインで伝える<br>関連する<br>長い文章の視覚効果をデザインで伝える</p></section>');
      assert.equal((await page.evaluate(inspectLines))[0].shortLine, '関連する');
      assert.equal((await page.evaluate(inspectLines))[0].suspect, true);
      await page.setContent('<section style="font:20px monospace"><p>長い文章の視覚効果をデザインで伝える<br>ほぼ同じ長さの説明文をここに置く<br>長い文章の視覚効果をデザインで伝える</p></section>');
      assert.equal((await page.evaluate(inspectLines))[0].suspect, false);
      await page.setContent('<section style="font:20px/30px sans-serif"><div style="float:right;width:20px;height:200px"></div><p>A <em>[<a>Huang+ MM’22 / Hsiao+ NAACL’25</a>]</em></p><p style="clear:right">離れた節</p><p>A <em>[<a>Huang+ MM’22</a>]</em> / B <em>[<a>Hsiao+ NAACL’25</a>]</em></p><blockquote><p><img></p><p style="margin-top:90px">Figure from [<a>Author+ Venue’25</a>]: 図の説明</p></blockquote></section>');
      const structure = await page.evaluate(inspectStructure);
      assert.deepEqual(structure.map(f => f.kind), ['bundled-citation', 'large-prose-gap']);
      assert.equal(structure[1].text, '離れた節');
      await page.setContent('<section style="width:300px;height:120px;font:20px/30px sans-serif"><p style="width:80px;white-space:nowrap">Hsiao+ NAACL’25</p><p style="transform:translateY(100px)">下端のはみ出し</p><p style="height:5px">本文枠の下端</p></section>');
      assert.equal((await page.evaluate(inspectStructure)).filter(f => f.kind === 'text-overflow').length, 3);
      await page.setContent('<section style="width:300px;height:120px"><p style="display:grid;width:80px"><a style="width:max-content;white-space:nowrap">Intentional wide image caption</a></p></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section><blockquote><p><img></p><p>Figure 2 description <em>[<a>Huang+ ECCV’26</a>]</em></p></blockquote></section>');
      assert.equal((await page.evaluate(inspectStructure)).filter(f => f.kind === 'figure-source').length, 2);
      await page.setContent('<section><blockquote><p><img></p><p>Figure from [<a>Huang+ ECCV’26</a>]: 図の説明</p></blockquote></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section><blockquote><p><img></p><p>Figure from [<a>Huang+ ECCV’26</a>]: 説明<br>横軸の説明<br>縦軸の説明</p></blockquote></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section><blockquote><p><img></p><p>Figure from [<a>Huang+ ECCV’26</a>]: Figure 3(a)<br>縦軸: 関連要素</p></blockquote><p>横軸: 説明文</p></section>');
      assert.deepEqual((await page.evaluate(inspectStructure)).filter(f => f.kind.startsWith('axis-')).map(f => f.kind).sort(), ['axis-outside-figure-caption', 'axis-pair-missing']);
      await page.setContent('<section><blockquote><p><img></p><p>Figure from [<a>Huang+ ECCV’26</a>]: 訓練規模<br>X 軸: データ割合<br>左 縦 軸: Weighted Acc.<br>右縦軸: 精度差</p></blockquote></section>');
      assert.deepEqual((await page.evaluate(inspectStructure)).filter(f => f.kind.startsWith('axis-')), []);
      await page.setContent('<section><p>横 軸: body text</p></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'axis-outside-figure-caption'), true);
      await page.setContent('<section><p style="font-size:24px">本文</p><blockquote><p><img></p><p style="font-size:20px">図の説明</p></blockquote></section><section><p style="font-size:24px">本文</p><blockquote><p><img></p><p style="font-size:18px">図の説明</p></blockquote></section>');
      assert.deepEqual((await page.evaluate(inspectTypography)).map(f => f.slide), [1, 2]);
      await page.addStyleTag({ content: 'blockquote p {font-size:20px!important}' });
      assert.deepEqual(await page.evaluate(inspectTypography), []);
      await page.setContent('<section class="profile-slide"><blockquote><p>経歴</p></blockquote><blockquote><p><img></p><p><a>連絡先</a></p></blockquote></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section style="font:20px/30px sans-serif"><blockquote><p><img style="width:80px;height:40px"></p><p id="source" style="margin-top:90px">Figure from [<a>Huang+ ECCV’26</a>]: 説明</p></blockquote><p id="footer">出典: Huang+ ECCV’26</p></section>');
      assert.deepEqual((await page.evaluate(inspectStructure)).map(f => f.kind), ['redundant-source', 'figure-source-gap']);
      await page.evaluate(() => { document.querySelector('#footer').remove(); document.querySelector('#source').style.marginTop = '0'; });
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      for (const caption of ['Figure from [<a>Huang+ ECCV’26</a>]', 'Figure from [<a>Huang+ ECCV’26</a>]: ']) {
        await page.setContent(`<section><p>${caption}</p></section>`);
        assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'figure-caption-missing'), true);
      }
      await page.setContent('<section style="width:1280px;height:720px;padding-bottom:48px"><h2>比較</h2><p>文書・画面理解</p><p>デザイン生成</p><p id="last">本研究</p></section>');
      assert.ok(bodyFillFindings(await page.evaluate(inspectBodyFill)).length);
      // A tall empty wrapper must not disguise sparse text.
      await page.addStyleTag({ content: 'p {height:100px}' });
      assert.ok(bodyFillFindings(await page.evaluate(inspectBodyFill)).length);
      await page.addStyleTag({ content: '#last {margin-top:300px}' });
      assert.deepEqual(bodyFillFindings(await page.evaluate(inspectBodyFill)), []);
      await page.setContent('<section class="layout-example" style="height:720px"><h2>背景の見本</h2><p>クラス名</p></section>');
      assert.deepEqual(bodyFillFindings(await page.evaluate(inspectBodyFill)), []);
      for (const className of ['first-slide', 'lead', 'takahashi', 'title-slide-big']) {
        await page.setContent(`<section class="${className}" style="height:720px"><h2>Title</h2><p>Short</p></section>`);
        assert.deepEqual(bodyFillFindings(await page.evaluate(inspectBodyFill)), []);
      }
      await page.setContent('<section style="position:relative;width:1000px;height:700px;font:20px/20px monospace"><h2 style="height:50px;margin:0">Comparison</h2><blockquote style="position:absolute;left:0;top:60px;width:400px;height:600px;margin:0"><p style="margin:500px 0 0">Tall figure caption</p></blockquote><blockquote style="position:absolute;left:500px;top:60px;width:400px;height:600px;margin:0"><p style="margin:0">Short text</p></blockquote></section>');
      const emptyColumn = bodyFillFindings(await page.evaluate(inspectBodyFill));
      assert.equal(emptyColumn.length, 1);
      assert.equal(emptyColumn[0].scope, 'column');
      assert.ok(emptyColumn[0].text.includes('Short text'));
      await page.evaluate(() => { document.querySelectorAll('blockquote p')[1].style.marginTop = '500px'; });
      assert.deepEqual(bodyFillFindings(await page.evaluate(inspectBodyFill)), []);
      await page.setContent('<section style="position:relative;width:1000px;height:700px;font:20px/20px monospace"><h2 style="height:50px;margin:0">Shared formula below columns</h2><blockquote style="position:absolute;left:0;top:60px;width:400px;height:200px;margin:0"><p style="margin:150px 0 0">Left</p></blockquote><blockquote style="position:absolute;left:500px;top:60px;width:400px;height:200px;margin:0"><p style="margin:150px 0 0">Right</p></blockquote><p style="position:absolute;left:0;top:300px;width:1000px;margin:0"><mjx-container style="display:block;width:1000px;height:300px"></mjx-container></p></section>');
      const sharedFormula = await page.evaluate(inspectBodyFill);
      assert.equal(sharedFormula.filter(r => r.scope === 'column').length, 2);
      assert.ok(sharedFormula.filter(r => r.scope === 'column').every(r => r.bottom === 300));
      assert.deepEqual(bodyFillFindings(sharedFormula), []);
      await page.setContent('<section style="position:relative;width:1000px;height:700px;font:20px/20px monospace"><h2 style="height:50px;margin:0">Stacked left column</h2><blockquote style="position:absolute;left:0;top:60px;width:400px;height:200px;margin:0"><p style="margin:0">Figure above</p></blockquote><blockquote style="position:absolute;left:0;top:300px;width:400px;height:300px;margin:0"><p style="margin:250px 0 0">Explanation below</p></blockquote><blockquote style="position:absolute;left:500px;top:60px;width:400px;height:600px;margin:0"><p style="margin:500px 0 0">Right column</p></blockquote></section>');
      const stackedColumn = await page.evaluate(inspectBodyFill);
      assert.equal(stackedColumn.filter(r => r.scope === 'column').length, 2);
      assert.deepEqual(bodyFillFindings(stackedColumn), []);
      await page.setContent('<section style="position:relative;height:700px;font:20px/20px monospace"><h2 style="height:50px;margin:0">Background</h2><p style="position:absolute;top:480px;margin:0">Content at 69 percent</p></section>');
      assert.equal(bodyFillFindings(await page.evaluate(inspectBodyFill))[0].scope, 'body');
      await page.evaluate(() => { document.querySelector('p').style.top = '550px'; });
      assert.deepEqual(bodyFillFindings(await page.evaluate(inspectBodyFill)), []);
      await page.setContent('<section style="width:300px;height:100px"><blockquote style="height:160px">枠のはみ出し</blockquote></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'box-overflow'), true);
      await page.setContent('<section style="position:relative;width:300px;height:120px;padding-bottom:20px"><p style="position:absolute;top:105px;margin:0"><mjx-container class="MathJax" display="true" style="display:block;height:30px"></mjx-container></p></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'math-overflow'), true);
      await page.evaluate(() => { document.querySelector('p').style.top = '60px'; });
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'math-overflow'), false);
      for (const text of ['BLEU', 'BLEU（Bilingual Evaluation Understudy）', 'BLEU で比較 <em>[<a href="https://aclanthology.org/P02-1040/">Papineni+ ACL’02</a>]</em>']) {
        await page.setContent(`<section><p>${text}</p></section>`);
        assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'missing-metric-citation'), true);
      }
      await page.setContent('<section><p><strong>BLEU</strong> <em>[<a href="https://aclanthology.org/P02-1040/">Papineni+ ACL’02</a>]</em> で比較</p></section>');
      assert.deepEqual(await page.evaluate(inspectStructure), []);
      await page.setContent('<section><p>手法 <em><a>Kitada+ IEEE Access’21</a></em></p></section>');
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'unbracketed-citation'), true);
      await page.evaluate(() => { document.querySelector('a').textContent = '[Kitada+ IEEE Access’21]'; });
      assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'linked-citation-bracket'), true);
      for (const citation of [
        '<em>[<a>Kitada+ IEEE Access’21</a>]</em>',
        '<em>[<a>Kitada+ IEEE Access’21</a>, <a>Appl. Intell.’22</a>]</em>',
      ]) {
        await page.setContent(`<section><p>手法 ${citation}</p></section>`);
        assert.deepEqual(await page.evaluate(inspectStructure), []);
      }
      for (const citation of ['[<a>Kitada+ IEEE Access’21</a>', '<a>Kitada+ IEEE Access’21</a>]']) {
        await page.setContent(`<section><p>${citation}</p></section>`);
        assert.equal((await page.evaluate(inspectStructure)).some(f => f.kind === 'unbracketed-citation'), true);
      }
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
      // LAYOUT_OUT lets parallel editors render into separate directories.
      const output = path.resolve(process.env.LAYOUT_OUT ?? 'dist', relative, `${path.parse(input).name}-review`);
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
      const titleFindings = blocks.filter(b => b.multiLineTitle).map(b => ({ slide: b.slide, kind: 'title-wrap', text: `${b.text} (${b.lines.length} lines)` }));
      const headingFindings = blocks.filter(b => b.headingWrap).map(b => ({ slide: b.slide, kind: b.headingWrap, text: `${b.text} (${b.lines.length} lines)` }));
      const termsPath = path.join(path.dirname(input), 'terms.json');
      const terms = fs.existsSync(termsPath) ? JSON.parse(fs.readFileSync(termsPath, 'utf8')) : {};
      const columns = await page.evaluate(inspectColumns);
      const groupGaps = await page.evaluate(inspectGroupGaps);
      const bodyFill = await page.evaluate(inspectBodyFill);
      const structure = [...await page.evaluate(inspectStructure), ...await page.evaluate(inspectTypography), ...await page.evaluate(inspectTerms, terms), ...await page.evaluate(inspectMidwordWraps), ...titleFindings, ...headingFindings, ...columnFindings(columns), ...groupGapFindings(groupGaps), ...bodyFillFindings(bodyFill)];
      structuralErrors += structure.length + candidates.length;
      candidateCount += candidates.length + structure.length;
      fs.writeFileSync(path.join(output, 'lines.json'), JSON.stringify({ input, browser: await browser.version(), blocks, columnPairs: columns, groupGaps, bodyFill, structure }, null, 2));
      await page.evaluate(() => document.querySelectorAll('.debug-layout').forEach(e => e.classList.remove('debug-layout')));
      const sections = await page.$$('section');
      if (!sections.length) throw new Error(`No slides rendered: ${input}`);
      const report = [`# Layout review: ${input}`, '', `${candidates.length} line-balance errors; ${structure.length} structure/typography findings. Review each image at full size; zero findings does not mean good layout.`, ''];
      for (const finding of structure.filter(f => f.slide === 0)) {
        report.push(`Error ${finding.kind}: ${finding.text}`, '');
        console.log(`${input} ERROR ${finding.kind}: ${finding.text}`);
      }
      for (let i = 0; i < sections.length; i++) {
        const filename = `slide-${i + 1}.png`;
        await sections[i].screenshot({ path: path.join(output, filename) });
        report.push(`## Slide ${i + 1}`, '', `![Slide ${i + 1}](${filename})`, '');
        for (const candidate of candidates.filter(c => c.slide === i + 1)) {
          report.push(`Error ${candidate.element}: shortest non-first line is ${Math.round(candidate.shortLineRatio * 100)}% of the longest line.`, '', '```text', ...candidate.lines, '```', '');
          console.log(`${input}:${i + 1} ERROR unbalanced-lines: ${candidate.shortLine}`);
        }
        for (const finding of structure.filter(f => f.slide === i + 1)) {
          const message = `${finding.kind}: ${finding.text}${finding.gap === undefined ? '' : ` (gap ${finding.gap}px, ${finding.limit === undefined ? `margin ${finding.expected}` : `limit ${finding.limit}`}px)`}`;
          report.push(`Error ${message}`, '');
          console.log(`${input}:${i + 1} ERROR ${message}`);
        }
      }
      fs.writeFileSync(path.join(output, 'review.md'), report.join('\n'));
      console.log(`${sections.length} slides saved: ${path.join(output, 'review.md')}`);
    }
    console.log(`${candidateCount} layout errors; all findings fail the check.`);
    if (structuralErrors) throw new Error(`${structuralErrors} layout errors: see review.md.`);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
