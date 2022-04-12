const path = require('path');
const { makeBaseConfig } = require('../webpack.config.base');

const makePatchedBaseConfig = ({ mode, target, hmre, devtool, plugins }) => {
  const base = makeBaseConfig({ mode, target, hmre, devtool, plugins, tsconfig: path.resolve(__dirname, '..', 'tsconfig.karma.json') });

  // Add util fallback for karma internals
  base.resolve.fallback.util = require.resolve('util/');
  return base;
};

module.exports = { makeBaseConfig: makePatchedBaseConfig };
