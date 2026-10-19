const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

function inspectLayoutCoverage(css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const classes = new Set();
  // shortcut: ASCII class names only; tokenize CSS escapes if the theme starts using them.
  const visit = rules => {
    for (const rule of rules) {
      if (rule.cssRules) visit(rule.cssRules);
      for (const anchor of (rule.selectorText || '').matchAll(/\bsection\b|:root\b/g)) {
        const selector = rule.selectorText.slice(anchor.index + anchor[0].length);
        const functions = [];
        for (let i = 0; i < selector.length; i++) {
          const char = selector[i];
          if (!functions.length && /[\s>+~,]/.test(char)) break;
          if (char === '[') {
            // Attribute values can contain dots or selector-looking text.
            const attribute = selector.slice(i).match(/^\[(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\]"'])*\]/);
            if (attribute) i += attribute[0].length - 1;
          } else if (char === '(') {
            const name = selector.slice(0, i).match(/:([\w-]+)$/)?.[1];
            functions.push(functions.includes(false) ? false : ['is', 'where', 'not'].includes(name));
          } else if (char === ')') functions.pop();
          else if (char === '.' && !functions.includes(false)) {
            const name = selector.slice(i + 1).match(/^[\w-]+/)?.[0];
            if (name) { classes.add(name); i += name.length; }
          }
        }
      }
    }
  };
  visit(sheet.cssRules);
  const declared = key => (css.match(new RegExp(`/\\*\\s*@${key}:([\\s\\S]*?)\\*/`))?.[1] || '').trim().split(/\s+/).filter(Boolean);
  const layouts = declared('layouts'), utilities = declared('utility-classes');
  const matches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
  const used = new Set([...document.querySelectorAll('section')].flatMap(slide => [...slide.classList]));
  const findings = [];
  const add = (kind, text) => findings.push({ slide: 0, kind, text });
  for (const name of classes) if (![...layouts, ...utilities].some(pattern => matches(pattern, name))) add('layout-class-unregistered', name);
  for (const name of layouts) {
    if (!/^[a-z][\w-]*$/.test(name) || !classes.has(name)) add('layout-class-stale', `@layouts: ${name}`);
    else if (!used.has(name)) add('layout-sample-missing', `${name}: add a sample to slides/example/slides.md`);
  }
  for (const name of utilities) if (!/^[a-z][\w-]*\*?$/.test(name) || ![...classes].some(value => matches(name, value))) add('layout-class-stale', `@utility-classes: ${name}`);
  return { classes: [...classes].sort(), layouts, utilities, findings };
}

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
  const boldHeading = element => {
    const strong = element?.querySelector(':scope > strong:only-child, :scope > a:only-child > strong:only-child');
    return element?.tagName === 'P' && strong && element.textContent.trim() === strong.textContent.trim();
  };
  const group = element => element && /^(P|UL|OL|TABLE)$/.test(element.tagName) && !boldHeading(element);
  const lastGroup = box => [...box.children].reverse().find(group);
  const themeGap = Math.max(...sections.map(section => parseFloat(getComputedStyle(section).getPropertyValue('--list-group-gap'))).filter(Number.isFinite));
  const groups = [];
  for (const [index, slide] of sections.entries()) {
    if (slide.matches('.profile-slide,.first-slide,.lead,.takahashi,.title-slide-big,.layout-example')) continue;
    for (const heading of slide.querySelectorAll('p')) {
      if (!boldHeading(heading) || heading.closest('header,footer,blockquote:has(> p > img)')) continue;
      const next = heading.nextElementSibling;
      if (!group(next)) continue;
      let previous = heading.previousElementSibling;
      let crossesBox = false;
      if (!group(previous)) {
        const previousBox = heading.parentElement.previousElementSibling;
        if (!previousBox || previousBox.parentElement !== slide || previousBox.tagName !== 'BLOCKQUOTE' || previousBox.querySelector('img')) continue;
        const boxes = [...slide.children];
        const position = boxes.indexOf(heading.parentElement);
        const current = heading.getBoundingClientRect();
        const previousBoxRect = previousBox.getBoundingClientRect();
        if (previousBoxRect.right <= current.left || current.right <= previousBoxRect.left) continue;
        previous = boxes.slice(0, position).filter(box => box.tagName === 'BLOCKQUOTE').map(lastGroup).filter(group).filter(item => {
          const before = item.getBoundingClientRect();
          return before.width && before.right > current.left && current.right > before.left && before.bottom <= current.top;
        }).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
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

function inspectItemGaps() {
  const sections = [...document.querySelectorAll('section')];
  const body = sections.filter(s => !s.matches('.profile-slide,.first-slide,.lead,.takahashi,.title-slide-big,.layout-example'));
  const themeGaps = body.flatMap(slide => {
    if (!getComputedStyle(slide).getPropertyValue('--list-item-gap').trim()) return [];
    // Resolve calc()/em through CSS instead of parsing the custom-property token string.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--list-item-gap);width:0;margin:0;padding:0;border:0';
    slide.append(probe);
    const gap = parseFloat(getComputedStyle(probe).height);
    probe.remove();
    return Number.isFinite(gap) ? [gap] : [];
  });
  if (!themeGaps.length) return [];
  const limit = 2 * Math.min(...themeGaps);
  return body.flatMap(slide => [...slide.querySelectorAll('li + li,p + p')].flatMap(current => {
    const previous = current.previousElementSibling;
    if (current.closest('header,footer,blockquote:has(img)') || current.querySelector('img') || previous.querySelector('img')) return [];
    const strong = current.querySelector(':scope > strong, :scope > a > strong');
    const label = [...current.childNodes].filter(node => !node.matches?.('ul,ol')).map(node => node.textContent).join('').trim();
    if (strong && strong.textContent.trim() === label && (current.tagName === 'P' ? current.nextElementSibling?.matches('p,ul,ol,table') : current.querySelector(':scope > ul,:scope > ol'))) return [];
    const before = previous.getBoundingClientRect(), after = current.getBoundingClientRect();
    if (!before.width || !before.height || !after.width || !after.height || Math.min(before.right, after.right) <= Math.max(before.left, after.left)) return [];
    const gap = after.top - before.bottom;
    return gap > limit + 2 ? [{ slide: sections.indexOf(slide) + 1, kind: 'list-item-gap', gap, limit, text: current.textContent.trim() }] : [];
  }));
}

function inspectColumns() {
  const textSelector = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th';
  const firstText = block => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = [...range.getClientRects()].find(rect => rect.width && rect.height);
      if (!rect) continue;
      const owner = node.parentElement.closest(textSelector) || node.parentElement;
      const lineHeight = parseFloat(getComputedStyle(owner).lineHeight);
      return { top: rect.top, lineTop: Number.isFinite(lineHeight) ? rect.top + (rect.height - lineHeight) / 2 : owner.getBoundingClientRect().top, text: owner.textContent.trim(), image: false };
    }
    return null;
  };
  const lastLineBottom = block => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let bottom = -Infinity;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const owner = node.parentElement.closest(textSelector) || node.parentElement;
      const lineHeight = parseFloat(getComputedStyle(owner).lineHeight);
      for (const rect of range.getClientRects()) {
        if (rect.width && rect.height) bottom = Math.max(bottom, Number.isFinite(lineHeight) ? rect.bottom + (lineHeight - rect.height) / 2 : owner.getBoundingClientRect().bottom);
      }
    }
    return bottom;
  };
  const imageStart = img => {
    const box = img.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const style = getComputedStyle(img);
    const inset = side => (parseFloat(style[`border${side}Width`]) || 0) + (parseFloat(style[`padding${side}`]) || 0);
    const width = box.width - inset('Left') - inset('Right');
    const height = box.height - inset('Top') - inset('Bottom');
    let top = box.top + inset('Top');
    let paintedHeight = height;
    if (['contain', 'scale-down'].includes(style.objectFit) && img.naturalWidth && img.naturalHeight) {
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight, style.objectFit === 'scale-down' ? 1 : Infinity);
      paintedHeight = img.naturalHeight * scale;
      const spare = height - paintedHeight;
      // shortcut: only percentage/px object-position is resolved; extend when a deck uses position expressions.
      const position = style.objectPosition.match(/^\S+\s+(-?[\d.]+)(%|px)$/);
      if (position) top += position[2] === '%' ? spare * Number(position[1]) / 100 : Number(position[1]);
    }
    return { top, bottom: top + paintedHeight, lineTop: top, text: img.alt || img.getAttribute('src') || 'Image', image: true };
  };
  return [...document.querySelectorAll('section')].flatMap((slide, index) => {
    if (slide.matches('.first-slide,.lead,.takahashi,.title-slide-big,.profile-slide,.layout-example')) return [];
    const slideTop = slide.getBoundingClientRect().top;
    const blocks = [...slide.children].filter(block => !block.matches('h1,h2,header,footer,.pagination,.page-number,.classification,.classification-badge,.background-decoration')).map(block => {
      const images = [...block.querySelectorAll('img'), ...(block.matches('img') ? [block] : [])].map(imageStart).filter(Boolean);
      const starts = [firstText(block), ...images].filter(Boolean);
      const first = starts.sort((a, b) => a.lineTop - b.lineTop)[0];
      const box = block.getBoundingClientRect();
      return first && box.width && box.height ? { box, first, images, textBottom: lastLineBottom(block) } : null;
    }).filter(Boolean);
    const pairs = [];
    const seen = new Set();
    for (let i = 0; i < blocks.length; i++) {
      for (const right of blocks.slice(i + 1)) {
        const left = blocks[i];
        if (Math.min(left.box.bottom, right.box.bottom) <= Math.max(left.box.top, right.box.top)) continue;
        const [first, second] = left.box.left <= right.box.left ? [left, right] : [right, left];
        if (first.box.right > second.box.left) continue;
        const shared = blocks.filter(item => item.box.left <= first.box.left + 2 && item.box.right >= second.box.right - 2);
        const start = Math.max(slideTop, ...shared.filter(item => item.box.bottom <= Math.min(first.box.top, second.box.top) + 2).map(item => item.box.bottom));
        const end = Math.min(...shared.filter(item => item.box.top >= Math.max(first.box.top, second.box.top) + 2).map(item => item.box.top));
        const columnBlocks = column => blocks.filter(item => Math.abs(item.box.left - column.box.left) <= 2 && Math.abs(item.box.right - column.box.right) <= 2 && item.box.top >= start - 2 && item.box.top < end).sort((a, b) => a.first.lineTop - b.first.lineTop);
        const leftColumn = columnBlocks(first), rightColumn = columnBlocks(second);
        const a = leftColumn[0].first, b = rightColumn[0].first;
        const key = `${first.box.left}:${first.box.right}:${second.box.left}:${second.box.right}:${start}:${end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const leftTop = (a.image || b.image ? a.lineTop : a.top) - slideTop;
        const rightTop = (a.image || b.image ? b.lineTop : b.top) - slideTop;
        const figureColumn = a.image && !b.image ? leftColumn : b.image && !a.image ? rightColumn : [];
        const textColumn = figureColumn === leftColumn ? rightColumn : leftColumn;
        const images = figureColumn.flatMap(item => item.images);
        const textBottom = Math.max(...textColumn.map(item => item.textBottom));
        const imageBottom = images.length === 1 && !textColumn.some(item => item.images.length) ? images[0].bottom : null;
        const bottomDifference = imageBottom === null ? null : Math.abs(imageBottom - textBottom);
        const bottomAlignedFigure = bottomDifference !== null && bottomDifference <= 2 && images[0].top >= textColumn[0].first.lineTop - 2;
        pairs.push({ slide: index + 1, leftText: a.text, rightText: b.text, leftTop, rightTop, difference: Math.abs(leftTop - rightTop), imageBottom: imageBottom === null ? null : imageBottom - slideTop, textBottom: Number.isFinite(textBottom) ? textBottom - slideTop : null, bottomDifference, bottomAlignedFigure });
      }
    }
    return pairs;
  });
}

function columnFindings(columns) {
  return columns.filter(pair => pair.difference > 2 && !pair.bottomAlignedFigure).map(pair => ({
    slide: pair.slide,
    kind: 'column-alignment',
    text: `${pair.leftText} (${Math.round(pair.leftTop)}px) / ${pair.rightText} (${Math.round(pair.rightTop)}px)`,
    leftTop: pair.leftTop,
    rightTop: pair.rightTop,
  }));
}

function inspectSpaces() {
  const cell = 8;
  return [...document.querySelectorAll('section')].map((slide, index) => {
    const bounds = slide.getBoundingClientRect(), style = getComputedStyle(slide);
    const headings = [...slide.querySelectorAll(':scope > h1,:scope > h2')];
    const footer = slide.querySelector(':scope > footer');
    const body = {
      left: bounds.left + (parseFloat(style.paddingLeft) || 0),
      right: bounds.right - (parseFloat(style.paddingRight) || 0),
      top: Math.max(bounds.top + (parseFloat(style.paddingTop) || 0), ...headings.map(h => h.getBoundingClientRect().bottom)),
      bottom: Math.min(bounds.bottom - (parseFloat(style.paddingBottom) || 0), footer?.getBoundingClientRect().top ?? bounds.bottom),
    };
    const local = r => ({ x: r.left - bounds.left, y: r.top - bounds.top, width: r.right - r.left, height: r.bottom - r.top });
    const label = el => el.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) || el.getAttribute('alt') || el.tagName.toLowerCase();
    const excluded = el => el.closest('header,footer,h1,h2,.pagination,.page-number,.classification,.classification-badge,.background-decoration,[data-space-overlay]') || getComputedStyle(el).visibility === 'hidden';
    const ink = [];
    const add = (r, el) => {
      const clipped = {left:Math.max(body.left,r.left),right:Math.min(body.right,r.right),top:Math.max(body.top,r.top),bottom:Math.min(body.bottom,r.bottom)};
      if (clipped.right > clipped.left && clipped.bottom > clipped.top) ink.push({...clipped,element:el,label:label(el)});
    };
    const paintedImage = img => {
      const r = img.getBoundingClientRect(), css = getComputedStyle(img);
      const inset = side => (parseFloat(css[`border${side}Width`]) || 0) + (parseFloat(css[`padding${side}`]) || 0);
      let width = r.width - inset('Left') - inset('Right'), height = r.height - inset('Top') - inset('Bottom');
      let left = r.left + inset('Left'), top = r.top + inset('Top');
      if (['contain','scale-down'].includes(css.objectFit) && img.naturalWidth && img.naturalHeight) {
        const scale = Math.min(width/img.naturalWidth,height/img.naturalHeight,css.objectFit === 'scale-down' ? 1 : Infinity);
        // shortcut: resolve percentage/px positions; extend when a deck uses position expressions.
        const position = css.objectPosition.match(/^(-?[\d.]+)(%|px)\s+(-?[\d.]+)(%|px)$/);
        if (position) {
          left += position[2] === '%' ? (width-img.naturalWidth*scale)*Number(position[1])/100 : Number(position[1]);
          top += position[4] === '%' ? (height-img.naturalHeight*scale)*Number(position[3])/100 : Number(position[3]);
        }
        width = img.naturalWidth*scale; height = img.naturalHeight*scale;
      }
      return {left,top,right:left+width,bottom:top+height};
    };
    for (const el of slide.querySelectorAll('img,table,mjx-container,svg')) {
      if (excluded(el) || el.closest('mjx-container') && !el.matches('mjx-container')) continue;
      add(el.matches('img') ? paintedImage(el) : el.getBoundingClientRect(), el);
    }
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, el = node.parentElement;
      if (!node.textContent.trim() || excluded(el) || (el.closest('table,mjx-container,script,style') || slide.contains(el.closest('svg')))) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width && r.height) add(r, el.closest('p,li,figcaption,h3,h4,h5,h6') || el);
    }
    body.bottom = Math.max(body.top, body.bottom);
    const width = Math.max(0,body.right-body.left), height = body.bottom-body.top;
    const cols = Math.ceil(width/cell), rows = Math.ceil(height/cell);
    const occupied = Array.from({length:rows},()=>new Uint8Array(cols));
    for (const r of ink) for(let y=Math.floor((r.top-body.top)/cell);y<Math.ceil((r.bottom-body.top)/cell);y++)
      for(let x=Math.floor((r.left-body.left)/cell);x<Math.ceil((r.right-body.left)/cell);x++) if(occupied[y]&&x<cols) occupied[y][x]=1;
    // Empty-cell histograms enumerate rectangles; containment pruning retains maximal candidates.
    const heights = new Array(cols).fill(0), rectangles=[];
    for(let y=0;y<rows;y++) {
      for(let x=0;x<cols;x++) heights[x]=occupied[y][x]?0:heights[x]+1;
      const stack=[];
      for(let x=0;x<=cols;x++) {
        const h=x<cols?heights[x]:0; let start=x;
        while(stack.length&&stack.at(-1).height>h) {
          const item=stack.pop(); start=item.start;
          const r={left:body.left+start*cell,right:Math.min(body.right,body.left+x*cell),top:body.top+(y+1-item.height)*cell,bottom:Math.min(body.bottom,body.top+(y+1)*cell)};
          const w=r.right-r.left, rh=r.bottom-r.top;
          if((w>=160&&rh>=48)||w*rh>=width*height*0.015) rectangles.push(r);
        }
        if(h&&(!stack.length||stack.at(-1).height<h)) stack.push({start,height:h});
      }
    }
    rectangles.sort((a,b)=>(b.right-b.left)*(b.bottom-b.top)-(a.right-a.left)*(a.bottom-a.top));
    const maximal=[];
    for(const r of rectangles) if(!maximal.some(m=>m.left<=r.left&&m.right>=r.right&&m.top<=r.top&&m.bottom>=r.bottom)) maximal.push(r);
    const nearest = (r, side) => {
      const choices=ink.filter(b=>side==='above'||side==='below' ? b.left<r.right&&b.right>r.left&&(side==='above'?b.bottom<=r.top+cell:b.top>=r.bottom-cell) : b.top<r.bottom&&b.bottom>r.top&&(side==='left'?b.right<=r.left+cell:b.left>=r.right-cell));
      const distance=b=>side==='above'?Math.abs(r.top-b.bottom):side==='below'?Math.abs(b.top-r.bottom):side==='left'?Math.abs(r.left-b.right):Math.abs(b.left-r.right);
      choices.sort((a,b)=>distance(a)-distance(b));
      return choices[0]?.label || `body ${side==='above'?'top':side==='below'?'bottom':side} edge`;
    };
    const regions=maximal.map((r,i)=>({id:`S${i+1}`,...local(r),area:(r.right-r.left)*(r.bottom-r.top),neighbours:Object.fromEntries(['above','below','left','right'].map(side=>[side,nearest(r,side)]))}));
    const children=[...slide.children].filter(el=>!excluded(el));
    const blocks=children.map(el=>({el,box:el.getBoundingClientRect(),content:ink.filter(b=>el===b.element||el.contains(b.element))})).filter(b=>b.box.width&&b.box.height&&b.content.length);
    const columns=[],seen=new Set();
    for(let i=0;i<blocks.length;i++) for(const other of blocks.slice(i+1)) {
      const [a,b]=blocks[i].box.left<=other.box.left?[blocks[i],other]:[other,blocks[i]];
      if(a.box.right>b.box.left||Math.min(a.box.bottom,b.box.bottom)<=Math.max(a.box.top,b.box.top)) continue;
      const shared=blocks.filter(c=>c.box.left<=a.box.left+2&&c.box.right>=b.box.right-2);
      const start=Math.max(body.top,...shared.filter(c=>c.box.bottom<=Math.min(a.box.top,b.box.top)+2).map(c=>c.box.bottom));
      const end=Math.min(body.bottom,...shared.filter(c=>c.box.top>=Math.max(a.box.top,b.box.top)+2).map(c=>c.box.top));
      const key=`${a.box.left}:${a.box.right}:${b.box.left}:${b.box.right}:${start}:${end}`;
      if(seen.has(key)) continue; seen.add(key);
      const column=c=>{
        const items=blocks.filter(d=>Math.abs(d.box.left-c.box.left)<=2&&Math.abs(d.box.right-c.box.right)<=2&&d.box.bottom>start&&d.box.top<end);
        const content=items.flatMap(d=>d.content);
        return {text:items.map(d=>label(d.el)).join(' ').slice(0,120),top:Math.min(...content.map(r=>r.top))-bounds.top,bottom:Math.max(...content.map(r=>r.bottom))-bounds.top};
      };
      const left=column(a),right=column(b);
      columns.push({left,right,topDifference:Math.abs(left.top-right.top),bottomDifference:Math.abs(left.bottom-right.bottom)});
    }
    const gaps={};
    for(const name of ['--content-gap','--list-item-gap','--list-group-gap']) {
      const probe=document.createElement('div');probe.style.cssText=`position:absolute;visibility:hidden;height:var(${name},0px);width:0`;slide.append(probe);
      gaps[name]=probe.getBoundingClientRect().height;probe.remove();
    }
    const blockGaps=[...slide.querySelectorAll('p,li,ul,ol,table,blockquote,h3,h4,h5,h6')].flatMap(el=>{
      const next=el.nextElementSibling;
      if(!next||excluded(el)||excluded(next))return [];
      const a=el.getBoundingClientRect(),b=next.getBoundingClientRect();
      if(Math.min(a.right,b.right)<=Math.max(a.left,b.left)||b.top<a.top||!a.width||!a.height||!b.width||!b.height)return [];
      const variable=next.matches('li')?'--list-item-gap':next.matches('p')&&next.querySelector('strong')?.textContent.trim()===next.textContent.trim()?'--list-group-gap':'--content-gap';
      return [{before:label(el),after:label(next),gap:b.top-a.bottom,variable,expected:gaps[variable]}];
    });
    const captions=[...slide.querySelectorAll('p')].filter(p=>/^Figure from\b/.test(p.textContent.trim())).flatMap(caption=>{
      const figure=caption.closest('blockquote'),images=[...(figure||slide).querySelectorAll('img')];
      const c=caption.getBoundingClientRect();
      return images.map(img=>{const r=paintedImage(img),dx=Math.max(r.left-c.right,c.left-r.right,0),dy=Math.max(r.top-c.bottom,c.top-r.bottom,0);return {caption:label(caption),image:img.alt||img.getAttribute('src'),distance:Math.hypot(dx,dy),verticalGap:c.top-r.bottom};});
    });
    return {slide:index+1,title:headings.map(h=>label(h)).join(' | '),body:local(body),cell,threshold:{height:48,width:160,areaRatio:0.015},regions,columns,sharedGaps:gaps,blockGaps,captions};
  });
}

function drawSpaceOverlay(record) {
  const slide = document.querySelectorAll('section')[record.slide - 1];
  const bounds = slide.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.spaceOverlay = '';
  svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  for (const [property, value] of Object.entries({ position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', margin: '0', padding: '0', border: '0', 'grid-area': 'auto', 'z-index': '2147483647', 'pointer-events': 'none' })) svg.style.setProperty(property, value, 'important');
  slide.append(svg);
  const labels = [];
  for (const [index, region] of record.regions.entries()) {
    const color = ['#e63946', '#2166ac', '#008060'][index % 3];
    const rect = document.createElementNS(svg.namespaceURI, 'rect');
    for (const [key, value] of Object.entries({ x: region.x, y: region.y, width: region.width, height: region.height, fill: color, 'fill-opacity': '.12', stroke: color, 'stroke-width': '1' })) rect.setAttribute(key, value);
    const label = document.createElementNS(svg.namespaceURI, 'text');
    label.style.cssText = 'font:12px sans-serif;fill:#111;stroke:white;stroke-width:3px;paint-order:stroke';
    label.textContent = `${region.id} ${Math.round(region.width)}×${Math.round(region.height)}`;
    svg.append(rect, label);
    const width = label.getBBox().width + 6, height = 16;
    const clampX = x => Math.max(record.body.x, Math.min(x, record.body.x + record.body.width - width));
    const available = box => !labels.some(other => box.x < other.x + other.width && box.x + width > other.x && box.y < other.y + height && box.y + height > other.y);
    let position;
    for (let y = region.y; y <= region.y + region.height - height && !position; y += height) {
      position = [region.x + 3, region.x + region.width - width].map(x => ({ x: clampX(x), y })).find(available);
    }
    // Narrow overlapping rectangles may need their label outside their own area.
    for (let y = record.body.y; y <= record.body.y + record.body.height - height && !position; y += height) {
      for (let x = record.body.x; x <= record.body.x + record.body.width - width && !position; x += width) {
        if (available({ x, y })) position = { x, y };
      }
    }
    position ??= { x: clampX(region.x + 3), y: region.y };
    label.setAttribute('x', position.x);
    label.setAttribute('y', position.y + 12);
    labels.push({ ...position, width, height });
  }
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

function inspectTextConventions() {
  const selector = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th,header,footer';
  const word = '[\\p{Script=Latin}\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー\\p{Nd}]';
  const demonstratives = new Set(['その', 'この', 'それ', 'これ', 'あの', 'あれ', '当該']);
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  return [...document.querySelectorAll('section')].flatMap((slide, index) => [...slide.querySelectorAll(selector)].flatMap(block => {
    const citation = link => {
      const before = document.createRange(), after = document.createRange();
      before.selectNodeContents(block);
      before.setEndBefore(link);
      after.selectNodeContents(block);
      after.setStartAfter(link);
      return /^\[.*\]$/s.test(link.textContent.trim()) || /\[[^\[\]]*$/.test(before.toString()) && /^[^\[\]]*\]/.test(after.toString());
    };
    let text = '';
    const collect = parent => {
      for (const child of parent.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
        else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.matches('a') && citation(child)) text += '\uFFFD';
          else if (child.matches('code,pre,mjx-container,math,.katex,svg,img')) text += '\uFFFC';
          else if (child.matches('br')) text += '\n';
          else if (child.matches(selector)) text += '\uFFFC';
          else collect(child);
        }
      }
    };
    if (block.closest('code,pre,mjx-container,math,.katex')) return [];
    collect(block);
    text = text.replace(/\[[^\[\]]*\uFFFD[^\[\]]*\]/g, '\uFFFC').replace(/\uFFFD/g, '\uFFFC').replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>]+/gi, '\uFFFC');
    const findings = [];
    const add = (kind, match) => findings.push({ slide: index + 1, kind, text: `${match[0]} — ${text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20)}` });
    for (const match of text.matchAll(/[（）]/g)) add('parenthesis-width', match);
    for (const pattern of [new RegExp(`${word}([^\\S\\r\\n]*)\\(`, 'gu'), new RegExp(`\\)([^\\S\\r\\n]*)${word}`, 'gu')]) {
      for (const match of text.matchAll(pattern)) if (match[1] !== ' ') add('parenthesis-spacing', match);
    }
    for (const pattern of [/\(\s+|\s+\)/g, /\)[^\S\r\n]+(?=\p{P}|$|\n)/gu]) {
      for (const match of text.matchAll(pattern)) add('parenthesis-spacing', match);
    }
    // Segmentation cannot distinguish demonstratives from names or quoted examples.
    for (const token of segmenter.segment(text)) if (demonstratives.has(token.segment)) {
      findings.push({ slide: index + 1, kind: 'demonstrative', review: true, text: `${token.segment} — ${text.slice(Math.max(0, token.index - 20), token.index + token.segment.length + 30).replace(/[\s\uFFFC]+/g, ' ').trim()}` });
    }
    return findings;
  }));
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
      .filter(block => !block.querySelector('h1,h2,h3,h4,h5,h6,p,li,figcaption,td,th') && /(?:横軸|[左右]?縦軸|[xy]軸)[:：]\S/i.test(axisText(block.textContent)));
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
    const pageStyle = getComputedStyle(slide, '::after');
    const pageText = pageStyle.content.match(/^"([0-9 /]+)"$/)?.[1];
    if (slide.hasAttribute('data-marpit-pagination') && pageText && pageStyle.display !== 'none' && pageStyle.visibility !== 'hidden') {
      // A temporary text copy gives the generated Marpit counter the same glyph geometry as DOM text.
      const counter = document.createElement('span');
      for (const property of pageStyle) counter.style.setProperty(property, pageStyle.getPropertyValue(property));
      counter.style.content = 'normal';
      counter.style.visibility = 'hidden';
      counter.textContent = pageText;
      slide.append(counter);
      const range = document.createRange();
      range.selectNodeContents(counter);
      for (const rect of range.getClientRects())
        if (rect.width && rect.height) textRuns.push({ block: counter, rect });
      counter.remove();
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
      await page.setContent('<section class="sample"></section>');
      const coverageCSS = '/* @layouts: sample */ /* @utility-classes: classification-* */ section.sample {} :root.classification-public {}';
      assert.deepEqual((await page.evaluate(inspectLayoutCoverage, coverageCSS)).findings, []);
      await page.setContent('<section></section>');
      assert.deepEqual((await page.evaluate(inspectLayoutCoverage, coverageCSS)).findings.map(f => f.kind), ['layout-sample-missing']);
      await page.setContent('<section class="sample"></section>');
      assert.deepEqual((await page.evaluate(inspectLayoutCoverage, coverageCSS + 'section.new-layout {}')).findings.map(f => f.kind), ['layout-class-unregistered']);
      assert.deepEqual((await page.evaluate(inspectLayoutCoverage, coverageCSS.replace('sample */', 'sample obsolete */'))).findings.map(f => f.kind), ['layout-class-stale']);
      assert.deepEqual((await page.evaluate(inspectLayoutCoverage, coverageCSS.replace('classification-*', 'unused-*'))).findings.map(f => f.kind).sort(), ['layout-class-stale', 'layout-class-unregistered']);
      assert.ok((await page.evaluate(inspectLayoutCoverage, coverageCSS.replace('sample */', 'sam* */'))).findings.some(f => f.kind === 'layout-class-stale'));
      const nestedCoverage = await page.evaluate(inspectLayoutCoverage, '/* @layouts: sample */ /* @utility-classes: gray debug lead classification-* */ @media screen { section:is(.sample, .gray):not(.lead).debug:has(.child) > p.descendant {} } :root.classification-public {} section[data-name=".attribute"] {}');
      assert.deepEqual(nestedCoverage.classes, ['classification-public', 'debug', 'gray', 'lead', 'sample']);
      assert.deepEqual(nestedCoverage.findings, []);
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
      await page.setContent('<section style="font:30px/20px monospace;--list-item-gap:calc(.25 * 1em)"><ul style="display:flex;flex-direction:column;justify-content:space-between;height:200px;margin:0"><li>First</li><li>Second</li></ul></section>');
      const spreadItems = await page.evaluate(inspectItemGaps);
      assert.equal(spreadItems.length, 1);
      assert.equal(spreadItems[0].gap, 160);
      assert.equal(spreadItems[0].limit, 15);
      await page.evaluate(() => { document.querySelector('ul').style.justifyContent = 'flex-start'; document.querySelector('li + li').style.marginTop = 'var(--list-item-gap)'; });
      assert.deepEqual(await page.evaluate(inspectItemGaps), []);
      await page.evaluate(() => { document.querySelector('li + li').style.marginTop = '17px'; });
      assert.deepEqual(await page.evaluate(inspectItemGaps), []);
      await page.evaluate(() => { document.querySelector('li + li').style.marginTop = '18px'; });
      assert.equal((await page.evaluate(inspectItemGaps)).length, 1);
      for (const heading of ['<strong>Group</strong>', '<a><strong>Group</strong></a>']) {
        await page.setContent(`<section style="font:30px/20px monospace;--list-item-gap:7.5px"><p style="margin:0">Previous</p><p style="margin:24px 0 0">${heading}</p><ul><li>Next group</li></ul></section>`);
        assert.deepEqual(await page.evaluate(inspectItemGaps), []);
      }
      await page.setContent('<section style="font:30px/20px monospace;--list-item-gap:7.5px"><ul><li>Previous</li><li style="margin-top:24px"><strong>Group</strong><ul><li>Next group</li></ul></li></ul></section>');
      assert.deepEqual(await page.evaluate(inspectItemGaps), []);
      await page.setContent('<section style="font:30px/20px monospace;--list-item-gap:7.5px"><p style="margin:0">First</p><p style="margin:80px 0 0">Second</p></section>');
      assert.equal((await page.evaluate(inspectItemGaps)).length, 1);
      await page.evaluate(() => { document.querySelector('p + p').style.marginTop = '16px'; });
      assert.deepEqual(await page.evaluate(inspectItemGaps), []);
      await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<section style="--list-item-gap:100px"></section>'); document.querySelector('p + p').style.marginTop = '80px'; });
      assert.equal((await page.evaluate(inspectItemGaps)).length, 1);
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
      await page.setContent('<style>section{position:relative;width:500px;height:180px;font:20px/20px monospace;--list-group-gap:16px}blockquote,p,ul{margin:0}blockquote{position:absolute}li{list-style:none}</style><section><blockquote style="left:250px;top:20px;width:250px"><p><img style="display:block;width:80px;height:40px"></p><p style="margin-top:20px">Figure from [S]</p></blockquote><blockquote style="left:0;top:20px;width:250px"><ul style="height:47px"><li>Previous text</li></ul></blockquote><blockquote style="left:0;top:116px;width:500px"><p><strong>Full-width group</strong></p><ul><li>Next</li></ul></blockquote></section><section><ul><li>Previous</li></ul><p style="margin-top:16px"><strong>Normal group</strong></p><ul><li>Next</li></ul></section>');
      const captionGroupGaps = await page.evaluate(inspectGroupGaps);
      assert.deepEqual(captionGroupGaps.groups.map(group => group.gap), [16, 16]);
      assert.deepEqual(groupGapFindings(captionGroupGaps), []);
      await page.evaluate(() => { document.querySelectorAll('blockquote')[2].style.top = '108px'; });
      assert.ok(groupGapFindings(await page.evaluate(inspectGroupGaps)).some(f => f.slide === 1 && f.gap === 8));
      await page.evaluate(() => { const box = document.querySelectorAll('blockquote')[2]; box.style.top = '83px'; box.querySelector('p').style.width = '250px'; });
      const narrowHeadingGaps = await page.evaluate(inspectGroupGaps);
      assert.equal(narrowHeadingGaps.groups[0].previous, 'ul');
      assert.deepEqual(narrowHeadingGaps.groups.map(group => group.gap), [16, 16]);
      assert.deepEqual(groupGapFindings(narrowHeadingGaps), []);
      await page.setContent('<section style="--list-group-gap:16px"><blockquote><p><img style="width:80px;height:40px"></p><p>Figure from [S]</p></blockquote><blockquote><p><strong>First text group beside a figure</strong></p><ul><li>Next</li></ul></blockquote></section>');
      assert.deepEqual((await page.evaluate(inspectGroupGaps)).groups, []);
      await page.setContent('<section style="font:20px/20px monospace;--list-group-gap:16px"><h2>Title</h2><p style="margin:0"><strong>Group</strong></p><ul style="margin:0"><li>Next</li></ul></section>');
      assert.deepEqual((await page.evaluate(inspectGroupGaps)).groups, []);
      for (const heading of ['<strong>Group</strong>', '<strong><a href="#table">Group</a></strong>', '<a href="#table"><strong>Group</strong></a>']) {
        await page.setContent(`<section style="font:20px/20px monospace;--list-group-gap:16px"><ul style="margin:0"><li>Previous</li></ul><p style="margin:0">${heading}</p><table><tr><td>Next</td></tr></table></section>`);
        const tableGap = await page.evaluate(inspectGroupGaps);
        assert.equal(tableGap.groups.length, 1);
        assert.equal(tableGap.groups[0].next, 'table');
        assert.ok(groupGapFindings(tableGap).some(f => f.gap === 0 && f.limit === 16));
        await page.evaluate(() => { document.querySelector('p').style.marginTop = '16px'; });
        assert.equal((await page.evaluate(inspectGroupGaps)).groups[0].gap, 16);
        assert.deepEqual(groupGapFindings(await page.evaluate(inspectGroupGaps)), []);
      }
      await page.setContent('<section style="font:20px/20px monospace;--list-group-gap:16px"><table><tr><td>Previous</td></tr></table><p style="margin:0"><strong>Group</strong></p><ul><li>Next</li></ul></section>');
      const previousTableGap = await page.evaluate(inspectGroupGaps);
      assert.equal(previousTableGap.groups[0].previous, 'table');
      assert.ok(groupGapFindings(previousTableGap).some(f => f.gap === 0));
      for (const heading of ['Plain <strong>Group</strong>', '<a href="#table">Plain <strong>Group</strong></a>']) {
        await page.setContent(`<section style="--list-group-gap:16px"><ul><li>Previous</li></ul><p>${heading}</p><table><tr><td>Next</td></tr></table></section>`);
        assert.deepEqual((await page.evaluate(inspectGroupGaps)).groups, []);
      }
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
      await page.setContent('<style>section::after{content:attr(data-marpit-pagination) " / " attr(data-marpit-pagination-total);position:absolute;top:0;right:0;font:10px/12px monospace}</style><section data-marpit-pagination="1" data-marpit-pagination-total="1" style="position:relative;width:500px;height:300px;font:20px/20px monospace"><p style="position:absolute;top:20px;left:0;margin:0">Body</p><footer style="position:absolute;bottom:10px;left:0;font:10px/12px monospace;white-space:nowrap">Copyright / dataset creation / provenance notes</footer></section>');
      assert.deepEqual((await page.evaluate(inspectStructure)).filter(f => ['footer-overflow', 'text-overflow', 'text-overlap'].includes(f.kind)), []);
      assert.deepEqual(await page.evaluate(inspectTypography), []);
      await page.evaluate(() => { Object.assign(document.querySelector('footer').style, {top:'20px',bottom:'auto'}); });
      const footerBodyOverlap = await page.evaluate(inspectStructure);
      assert.ok(footerBodyOverlap.some(f => f.kind === 'text-overlap' && f.text === 'Body'));
      assert.ok(footerBodyOverlap.some(f => f.kind === 'footer-overflow' && f.text.startsWith('Body')));
      await page.evaluate(() => { Object.assign(document.querySelector('footer').style, {top:'0',left:'auto',right:'0'}); });
      const footerPageOverlap = await page.evaluate(inspectStructure);
      assert.ok(footerPageOverlap.some(f => f.kind === 'text-overlap' && f.text === '1 / 1'));
      assert.ok(footerPageOverlap.some(f => f.kind === 'text-overlap' && f.text.startsWith('Copyright')));
      await page.evaluate(() => { Object.assign(document.querySelector('footer').style, {top:'auto',bottom:'10px',left:'400px',right:'auto'}); });
      assert.ok((await page.evaluate(inspectStructure)).some(f => f.kind === 'text-overflow' && f.text.startsWith('Copyright')));
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
      await page.evaluate(() => { document.querySelector('blockquote').style.height = '80px'; });
      assert.equal(columnFindings(await page.evaluate(inspectColumns)).length, 1);
      const picture = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="red"/></svg>');
      await page.setContent(`<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/20px monospace"><blockquote style="margin:0;align-self:center"><img src="${picture}" alt="Figure" style="display:block;width:80px;height:40px"></blockquote><blockquote style="margin:0;height:100px">Right column</blockquote></section>`);
      await page.evaluate(async () => { await document.querySelector('img').decode(); });
      const centeredFigure = await page.evaluate(inspectColumns);
      assert.ok(Math.abs(centeredFigure[0].difference - 30) <= 1);
      assert.equal(columnFindings(centeredFigure).length, 1);
      // Matching content centers must not exempt a 30px leading blank area.
      await page.evaluate(() => { document.querySelectorAll('blockquote')[1].innerHTML = 'Right<br>column<br>has<br>five<br>lines'; });
      assert.equal(columnFindings(await page.evaluate(inspectColumns)).length, 1);
      await page.evaluate(() => { document.querySelectorAll('blockquote')[1].textContent = 'Right column'; });
      await page.evaluate(() => { document.querySelector('blockquote').style.alignSelf = 'start'; });
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.evaluate(() => { Object.assign(document.querySelector('img').style, {height:'100px',objectFit:'contain'}); });
      const containedFigure = await page.evaluate(inspectColumns);
      assert.ok(Math.abs(containedFigure[0].difference - 30) <= 1);
      assert.equal(columnFindings(containedFigure).length, 1);
      await page.evaluate(() => { document.querySelector('img').style.objectPosition = '50% 0%'; });
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.evaluate(() => { document.querySelector('img').style.objectPosition = '50% 30px'; });
      assert.ok(Math.abs((await page.evaluate(inspectColumns))[0].difference - 30) <= 1);
      await page.evaluate(() => { Object.assign(document.querySelector('img').style, {width:'160px',objectFit:'scale-down',objectPosition:'50% 50%'}); });
      assert.equal(columnFindings(await page.evaluate(inspectColumns)).length, 1);
      await page.evaluate(() => { document.querySelector('img').style.objectFit = 'contain'; });
      assert.ok(Math.abs((await page.evaluate(inspectColumns))[0].difference - 10) <= 1);
      await page.evaluate(() => { Object.assign(document.querySelector('img').style, {padding:'10px',border:'2px solid black'}); });
      assert.ok(Math.abs((await page.evaluate(inspectColumns))[0].difference - 22) <= 1);
      for (const className of ['first-slide', 'profile-slide', 'layout-example']) {
        await page.evaluate(className => { document.querySelector('section').className = className; }, className);
        assert.deepEqual(await page.evaluate(inspectColumns), []);
      }
      await page.setContent(`<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/20px monospace"><blockquote style="margin:60px 0 0;align-self:start"><img src="${picture}" alt="Figure" style="display:block;width:80px;height:40px"><p style="margin:4px 0 0">Figure from [Source]: caption</p></blockquote><blockquote style="margin:0">First<br>second<br>third<br>fourth<br>last</blockquote></section>`);
      await page.evaluate(async () => { await document.querySelector('img').decode(); });
      const bottomFigure = await page.evaluate(inspectColumns);
      assert.ok(bottomFigure[0].bottomDifference <= 1);
      assert.deepEqual(columnFindings(bottomFigure), []);
      await page.evaluate(() => { document.querySelector('blockquote').style.order = '1'; });
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      for (const [top, errors] of [[61, 0], [65, 1], [36, 1]]) {
        await page.evaluate(top => { document.querySelector('blockquote').style.marginTop = `${top}px`; }, top);
        assert.equal(columnFindings(await page.evaluate(inspectColumns)).length, errors, `picture top ${top}; caption bottom is not picture bottom`);
      }
      await page.evaluate(() => { document.querySelector('blockquote').style.marginTop = '0'; Object.assign(document.querySelector('img').style, {height:'100px',objectFit:'contain'}); });
      assert.equal(columnFindings(await page.evaluate(inspectColumns)).length, 1, 'element bottom matches but contained picture bottom does not');
      await page.evaluate(() => { document.querySelector('img').style.objectPosition = '50% 100%'; });
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.evaluate(() => { document.querySelector('img').style.objectFit = 'scale-down'; });
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.evaluate(() => { document.querySelectorAll('blockquote')[1].style.height = '200px'; document.querySelector('blockquote').style.marginTop = '100px'; });
      assert.equal(columnFindings(await page.evaluate(inspectColumns)).length, 1, 'empty text box height does not replace its last line');
      await page.evaluate(() => { document.querySelector('blockquote').style.marginTop = '0'; document.querySelectorAll('blockquote')[1].style.paddingTop = '20px'; Object.assign(document.querySelector('img').style, {height:'120px',objectFit:'fill'}); });
      assert.equal(columnFindings(await page.evaluate(inspectColumns)).length, 1, 'oversized picture starts above text');
      await page.setContent('<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/30px monospace"><blockquote style="margin:0">Left heading</blockquote><blockquote style="margin:0">Right heading</blockquote></section>');
      assert.deepEqual(columnFindings(await page.evaluate(inspectColumns)), []);
      await page.setContent('<section style="display:grid;grid-template-columns:1fr 1fr;width:500px;font:20px/30px monospace"><blockquote style="margin:0">First left</blockquote><blockquote style="margin:0">First right</blockquote><p style="grid-column:1 / -1;margin:0">Shared divider</p><blockquote style="margin:0">Second left<br>continues</blockquote><blockquote style="margin:10px 0 0">Second right</blockquote></section>');
      const bands = await page.evaluate(inspectColumns);
      assert.equal(bands.length, 2);
      assert.equal(columnFindings(bands).length, 1);
      assert.equal(columnFindings(bands)[0].text.startsWith('Second left'), true);
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
      for (const [source, count] of [
        ['その図 この図 それを選ぶ これを選ぶ あの図 あれを選ぶ 当該資料', 7],
        ['その他 その他の条件', 0],
        ['こ**の**図', 1],
        ['- この図\n  - その条件', 2],
        ['[この図](https://example.test/)', 1],
        ['`この図`\n\n```text\nその条件\n```', 0],
        [String.raw`$\text{この図}$ $\text{その条件}$`, 0],
        ['https://example.test/この図 www.example.test/その条件 [URL](https://example.test/それ)', 0],
        ['[[この著者+ 会議’26](https://example.test/)]', 0],
        ['<!-- speaker note: この図、その条件 -->\n\n具体的な説明', 0],
        ['このはずく', 1],
      ]) {
        await page.setContent(math.render(source).html);
        const review = (await page.evaluate(inspectTextConventions)).filter(f => f.kind === 'demonstrative');
        assert.equal(review.length, count, source);
        assert.ok(review.every(f => f.review === true), source);
      }
      for (const [source, kinds] of [
        ['（DF） （Qwen2.5-VL 7B） （%） （Table 4） （日本語）', Array(10).fill('parenthesis-width')],
        ['（unpaired', ['parenthesis-width']],
        ['unpaired）', ['parenthesis-width']],
        ['(DF); (Qwen2.5-VL 7B); (%); (Table 4); (日本語)', []],
        ['(説明); (日本語 (DF))', []],
        ['日本語(DF) レイヤー(DF) Model(DF) 7(DF)', Array(4).fill('parenthesis-spacing')],
        ['日本語 (DF) Model (DF) 7 (DF)', []],
        ['Model  (DF); (DF)  text', Array(2).fill('parenthesis-spacing')],
        ['日本語\u3000(DF); (DF)\u00a0文字', Array(2).fill('parenthesis-spacing')],
        ['( DF )', Array(2).fill('parenthesis-spacing')],
        ['(DF)説明 (MA)Latin (SP)7', Array(3).fill('parenthesis-spacing')],
        ['(DF) 説明 (MA) Latin (SP) 7', []],
        ['(DF) 、 (DF) ： (DF) .', Array(3).fill('parenthesis-spacing')],
        ['(DF) (SP)', ['parenthesis-spacing']],
        ['(DF)、(DF)。(DF)／(DF)', []],
        ['**日本語**(DF) **Model**(DF)', Array(2).fill('parenthesis-spacing')],
        ['- Parent\n  - Child（DF）', Array(2).fill('parenthesis-width')],
        ['`（DF）` `( 説明 )` `Model(DF)text`\n\n```text\n（DF） ( 説明 ) Model(DF)text\n```', []],
        [String.raw`$Q(e^q)$ $A^g(e_i)$ $\text{（DF）}$ $\text{( 説明 )}$ $\text{(DF)text}$`, []],
        ['https://example.test/Model(説明)/（DF） [URL](https://example.test/Model(説明)/（DF）)', []],
        ['FTP://example.test/Model(DF)/（説明） www.example.test/Model(DF)', []],
        ['[[Author+ ( 説明 ) Model(DF) （DF）](https://example.test/paper)]', []],
        ['低ランク適応 (LoRA) [[Hu+ ICLR’22](https://example.test/paper)]', []],
        ['[Regular （説明） link](https://example.test/)', Array(2).fill('parenthesis-width')],
        ['(説明 `Model(DF)`)', []],
      ]) {
        await page.setContent(math.render(source).html);
        assert.deepEqual((await page.evaluate(inspectTextConventions)).map(f => f.kind), kinds, source);
      }
      await page.setContent('<section><p>(DF) </p><p>(DF)<br>次の行</p></section>');
      assert.deepEqual((await page.evaluate(inspectTextConventions)).map(f => f.kind), ['parenthesis-spacing']);
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
      const axisReference = '<p>横軸の区間ごとに特定正解率（縦軸）を集計</p>';
      await page.setContent(`<section><blockquote><p><img></p><p>Figure from [<a>Huang+ ECCV’26</a>]: 説明<br>横軸: 語句一致度<br>縦軸: 特定正解率</p></blockquote>${axisReference}</section>`);
      assert.deepEqual((await page.evaluate(inspectStructure)).filter(f => f.kind.startsWith('axis-')), []);
      await page.evaluate(() => { document.querySelector('blockquote p:last-child').innerHTML = 'Figure from [<a>Huang+ ECCV’26</a>]: 説明<br>縦軸: 特定正解率'; });
      assert.deepEqual((await page.evaluate(inspectStructure)).filter(f => f.kind.startsWith('axis-')).map(f => f.kind), ['axis-pair-missing']);
      for (const label of ['横軸:', '縦軸：', '左縦軸:', '右縦軸:', 'x 軸:', 'Y 軸:']) {
        await page.setContent(`<section><p>図の説明 — ${label} 説明文</p></section>`);
        assert.equal((await page.evaluate(inspectStructure)).filter(f => f.kind === 'axis-outside-figure-caption').length, 1, label);
      }
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
      const spaceImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120"><rect width="480" height="120"/></svg>');
      await page.setContent(`<style>body{margin:0}section{position:relative;box-sizing:border-box;width:600px;height:400px;padding:20px;font:20px/20px monospace}h2{height:60px;margin:0}blockquote,p,h3{position:absolute;margin:0}footer{position:absolute;left:20px;top:360px}</style><section style="--content-gap:16px;--list-item-gap:8px;--list-group-gap:24px"><h2>Title excluded</h2><blockquote style="left:20px;top:80px;width:240px;height:140px"><img src="${spaceImage}" style="display:block;width:240px;height:120px"><p style="top:120px">Figure from: example</p></blockquote><blockquote style="left:300px;top:80px;width:280px;height:220px"><table style="width:280px;height:220px"><tr><td>Sibling text</td></tr></table></blockquote><h3 style="left:20px;top:300px;width:560px">Next full-width group</h3><footer>Footer excluded</footer></section>`);
      await page.evaluate(async () => { await document.images[0].decode(); });
      const [blankBand] = await page.evaluate(inspectSpaces);
      assert.ok(blankBand.regions.some(r => r.neighbours.above.includes('Figure from') && r.neighbours.below.includes('Next full-width group')));
      assert.deepEqual(blankBand.body, { x: 20, y: 80, width: 560, height: 280 });
      assert.ok(blankBand.regions.every(r => r.x >= 20 && r.y >= 80 && r.x + r.width <= 580 && r.y + r.height <= 360));
      assert.ok(blankBand.columns.some(c => c.bottomDifference > 16));
      assert.equal(blankBand.captions.length, 1);
      assert.equal(blankBand.captions[0].distance, 0);
      assert.deepEqual(blankBand.sharedGaps, { '--content-gap': 16, '--list-item-gap': 8, '--list-group-gap': 24 });
      const beforeOverlay = await page.evaluate(() => [...document.querySelectorAll('section,blockquote,h3')].map(el => el.getBoundingClientRect().toJSON()));
      await page.evaluate(drawSpaceOverlay, blankBand);
      assert.equal(await page.$$eval('[data-space-overlay] rect', rects => rects.length), blankBand.regions.length);
      assert.equal(await page.$$eval('[data-space-overlay] text', elements => {
        const boxes = elements.map(el => el.getBoundingClientRect());
        return boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)));
      }), false);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('section,blockquote,h3')].map(el => el.getBoundingClientRect().toJSON())), beforeOverlay);
      assert.deepEqual(await page.evaluate(inspectSpaces), [blankBand]);
      await page.evaluate(() => document.querySelector('[data-space-overlay]').remove());
      await page.setContent(`<style>body{margin:0}section{position:relative;box-sizing:border-box;width:600px;height:400px;padding:20px}h2{height:60px;margin:0}footer{position:absolute;top:360px}img{display:block;width:560px;height:280px}</style><section><h2>Title excluded</h2><img src="${spaceImage}"><footer>Footer excluded</footer></section>`);
      await page.evaluate(async () => { await document.images[0].decode(); });
      assert.deepEqual((await page.evaluate(inspectSpaces))[0].regions, []);
      // Marpit's outer SVG must not hide the section's HTML text from measurement.
      await page.setContent(`<style>body{margin:0}section{width:470px;height:160px;font:20px/20px monospace}p{margin:0}</style><svg width="600" height="400"><foreignObject width="600" height="400"><section xmlns="http://www.w3.org/1999/xhtml"><p>${Array(8).fill('X'.repeat(39)).join('<br>')}</p></section></foreignObject></svg>`);
      const [wrappedTextSpaces] = await page.evaluate(inspectSpaces);
      assert.ok(wrappedTextSpaces.regions.every(r => r.width < wrappedTextSpaces.body.width / 2));
      await page.setContent(`<style>body{margin:0}section{width:480px;height:240px}img{width:480px;height:240px;object-fit:contain}</style><section><img src="${spaceImage}"></section>`);
      await page.evaluate(async () => { await document.images[0].decode(); });
      const [containedSpaces] = await page.evaluate(inspectSpaces);
      assert.ok(containedSpaces.regions.some(r => r.y === 0 && r.height >= 48 && r.width === 480));
      assert.ok(containedSpaces.regions.some(r => r.y >= 180 && r.height >= 48 && r.width === 480));
      console.log('Layout inspection self-test passed');
      return;
    }
    const files = process.argv.slice(2);
    if (!files.length) files.push(...fs.readdirSync('slides', { recursive: true }).filter(p => p.endsWith('.md')).map(p => path.join('slides', p)));
    if (!files.length) throw new Error('No Markdown slides found under slides/');
    const sampleHTML = execFileSync('marp', ['--template', 'bare', 'slides/example/slides.md', '-o', '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    await page.setContent(sampleHTML);
    const layoutCoverage = await page.evaluate(inspectLayoutCoverage, fs.readFileSync('themes/ly.css', 'utf8'));
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
      const spaces = await page.evaluate(inspectSpaces);
      const textConventions = await page.evaluate(inspectTextConventions);
      const languageReview = textConventions.filter(f => f.review);
      fs.writeFileSync(path.join(output, 'spaces.json'), JSON.stringify({ input, browser: await browser.version(), slides: spaces }, null, 2));
      const structure = [...(input === files[0] ? layoutCoverage.findings : []), ...await page.evaluate(inspectStructure), ...textConventions.filter(f => !f.review), ...await page.evaluate(inspectTypography), ...await page.evaluate(inspectTerms, terms), ...await page.evaluate(inspectMidwordWraps), ...await page.evaluate(inspectItemGaps), ...titleFindings, ...headingFindings, ...columnFindings(columns), ...groupGapFindings(groupGaps), ...bodyFillFindings(bodyFill)];
      structuralErrors += structure.length + candidates.length;
      candidateCount += candidates.length + structure.length;
      fs.writeFileSync(path.join(output, 'lines.json'), JSON.stringify({ input, browser: await browser.version(), blocks, columnPairs: columns, groupGaps, bodyFill, structure, languageReview }, null, 2));
      await page.evaluate(() => document.querySelectorAll('.debug-layout').forEach(e => e.classList.remove('debug-layout')));
      const sections = await page.$$('section');
      if (!sections.length) throw new Error(`No slides rendered: ${input}`);
      const report = [`# Layout review: ${input}`, '', `${candidates.length} line-balance errors; ${structure.length} structure/typography findings; ${spaces.reduce((sum, slide) => sum + slide.regions.length, 0)} review-only space candidates; ${languageReview.length} review-only demonstrative candidates. Review each image at full size; zero findings does not mean good layout.`, ''];
      for (const finding of structure.filter(f => f.slide === 0)) {
        report.push(`Error ${finding.kind}: ${finding.text}`, '');
        console.log(`${input} ERROR ${finding.kind}: ${finding.text}`);
      }
      for (let i = 0; i < sections.length; i++) {
        const filename = `slide-${i + 1}.png`;
        await sections[i].screenshot({ path: path.join(output, filename) });
        report.push(`## Slide ${i + 1}`, '', `![Slide ${i + 1}](${filename})`, '');
        for (const finding of languageReview.filter(f => f.slide === i + 1)) {
          report.push(`Review ${finding.kind}: ${finding.text}`, '');
          console.log(`${input}:${i + 1} REVIEW ${finding.kind}: ${finding.text}`);
        }
        const space = spaces[i];
        const overlay = `slide-${i + 1}-space.png`;
        await page.evaluate(drawSpaceOverlay, space);
        try {
          await sections[i].screenshot({ path: path.join(output, overlay) });
        } finally {
          await page.evaluate(() => document.querySelectorAll('[data-space-overlay]').forEach(el => el.remove()));
        }
        const px = value => `${Number(value.toFixed(1))}px`;
        report.push('### Space review', '', `${space.regions.length} empty-region candidates (review only; not errors). Coordinates are relative to the slide top left.`, '', `![Space review ${i + 1}](${overlay})`, '');
        for (const region of space.regions) {
          report.push(`- ${region.id}: (${px(region.x)}, ${px(region.y)}), ${px(region.width)} × ${px(region.height)}; ${Object.entries(region.neighbours).map(([side, text]) => `${side}: ${JSON.stringify(text)}`).join('; ')}`);
        }
        report.push('', 'Column content edges (painted bounds):', '');
        for (const pair of space.columns) report.push(`- ${JSON.stringify(pair.left.text)} / ${JSON.stringify(pair.right.text)}: top ${px(pair.left.top)} / ${px(pair.right.top)} (difference ${px(pair.topDifference)}); bottom ${px(pair.left.bottom)} / ${px(pair.right.bottom)} (difference ${px(pair.bottomDifference)}).`);
        report.push('', `Shared gaps: ${Object.entries(space.sharedGaps).map(([name, value]) => `${name}=${px(value)}`).join(', ')}.`, '', 'Consecutive block gaps:', '');
        for (const gap of space.blockGaps) report.push(`- ${JSON.stringify(gap.before)} → ${JSON.stringify(gap.after)}: ${px(gap.gap)}; ${gap.variable}=${px(gap.expected)} (difference ${px(gap.gap - gap.expected)}).`);
        report.push('', 'Figure-to-caption distances:', '');
        for (const caption of space.captions) report.push(`- ${JSON.stringify(caption.image)} → ${JSON.stringify(caption.caption)}: distance ${px(caption.distance)}, vertical gap ${px(caption.verticalGap)}.`);
        report.push('');
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
    console.log(`${candidateCount} layout errors; space/language-review candidates do not fail the check.`);
    if (structuralErrors) throw new Error(`${structuralErrors} layout errors: see review.md.`);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
