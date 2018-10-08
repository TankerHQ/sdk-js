const getBabelConfig = require('../babel.config');

module.exports = require('@babel/register')({
  // babelify everything except node_modules that are not our own stuff
  ignore: [file => file.includes('node_modules') && !file.includes('@tanker')],
  sourceMaps: 'inline',
  ...getBabelConfig({ target: 'node', coverage: true }),
});
