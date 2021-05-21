// @noflow
const { makeBaseConfig } = require('../webpack.config.base');

const makePatchedBaseConfig = ({ mode, target, react, hmre, devtool, plugins }) => {
  const base = makeBaseConfig({ mode, target, react, hmre, devtool, plugins });

  // Add util fallback for karma internals
  base.resolve.fallback.util = require.resolve('util/');
  return base;
};

module.exports = { makeBaseConfig: makePatchedBaseConfig };
