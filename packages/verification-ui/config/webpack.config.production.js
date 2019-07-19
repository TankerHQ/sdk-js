// @noflow
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const { makeBaseConfig } = require('../../../config/webpack.config.base');

const webpackBaseConfig = makeBaseConfig({ mode: 'production', target: 'web', react: true });

module.exports = {
  ...webpackBaseConfig,

  entry: [path.resolve(__dirname, '..', 'src', 'index.js')],

  output: {
    filename: 'tanker-verification-ui.min.js',
    path: path.resolve(__dirname, '..', 'dist', 'umd'),
    library: 'Tanker',
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },

  plugins: [
    ...webpackBaseConfig.plugins,

    new CleanWebpackPlugin({ verbose: true }),
  ],
};
