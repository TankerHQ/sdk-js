const getBabelConfig = require('./babel.config');

module.exports = getBabelConfig({ target: 'node', react: true });
