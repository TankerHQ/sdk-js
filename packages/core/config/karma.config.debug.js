const path = require('path');
const base = require('../../../config/karma/karma.config.debug');

module.exports = config => {
  base(config);
  config.set({ basePath: path.resolve(__dirname, '..') });
};
