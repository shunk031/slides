function groupEnd(tokens, start) {
  if (tokens[start] !== '{') return -1;
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i] === '{') depth++;
    if (tokens[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

function checkUnderbraces(tex, slide) {
  // TeX commands keep escaped braces distinct from grouping braces.
  const tokens = tex.match(/\\[a-zA-Z]+|\\[\s\S]|%[^\n]*|[^\s]/g) || [];
  const parts = tokens.filter(token => !token.startsWith('%'));
  parts.forEach((token, index) => {
    if (token !== '\\underbrace') return;
    const bodyEnd = groupEnd(parts, index + 1);
    const labelStart = bodyEnd + 2;
    const labelEnd = groupEnd(parts, labelStart);
    const clapEnd = groupEnd(parts, labelStart + 2);
    if (bodyEnd < 0 || parts[bodyEnd + 1] !== '_' ||
        parts[labelStart + 1] !== '\\mathclap' || clapEnd < 0 || labelEnd !== clapEnd + 1) {
      throw new Error(`Slide ${slide}: underbrace-mathclap: Use \\underbrace{...}_{\\mathclap{...}} for every annotation.`);
    }
  });
}

module.exports = function checkMath(md) {
  md.core.ruler.after('marpit_directives_apply', 'check-math', state => {
    let slide = 0;
    const inspect = tokens => {
      for (const token of tokens) {
        if (token.type === 'marpit_slide_open') slide++;
        if (token.type === 'marp_math_inline' || token.type === 'marp_math_block')
          checkUnderbraces(token.content, slide);
        if (token.children) inspect(token.children);
      }
    };
    inspect(state.tokens);
  });
};
