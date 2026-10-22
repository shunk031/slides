module.exports = {
  themeSet: './themes',
  engine: ({ marp }) => marp.use(require('./scripts/check-classification.cjs')).use(require('./scripts/check-math.cjs')).use(require('./scripts/parenthesis-supplements.cjs')),
};
