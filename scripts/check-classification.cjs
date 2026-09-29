const allowed = new Set([
  'classification-top-secret',
  'classification-secret',
  'classification-restricted',
  'classification-internal',
  'classification-public',
]);

module.exports = function checkClassification(md) {
  md.core.ruler.after('marpit_directives_apply', 'check-classification', (state) => {
    const slides = state.tokens.filter((token) => token.type === 'marpit_slide_open');
    let expected;
    slides.forEach((slide, index) => {
      const classes = (slide.attrGet('class') || '').split(/\s+/)
        .filter((name) => name.startsWith('classification-'));
      const unknown = classes.filter((name) => !allowed.has(name));
      if (unknown.length) {
        throw new Error(`Slide ${index + 1}: Unknown classification: ${unknown.join(', ')}`);
      }
      if (classes.length > 1) {
        throw new Error(`Slide ${index + 1}: Multiple classifications: ${classes.join(', ')}`);
      }
      if (index === 0) expected = classes[0];
      if (classes[0] !== expected) {
        throw new Error(`Slide ${index + 1}: Classification differs from slide 1. Include the same classification in class and _class.`);
      }
    });
  });
};
