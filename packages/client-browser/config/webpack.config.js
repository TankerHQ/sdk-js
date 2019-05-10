// @noflow
const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const { makeBaseConfig } = require('../../../config/webpack.config.base');

const webpackBaseConfig = makeBaseConfig({ mode: 'production', target: 'web' });

module.exports = {
  ...webpackBaseConfig,

  entry: [path.resolve(__dirname, '..', 'src', 'index.js')],

  output: {
    filename: 'tanker-client-browser.min.js',
    path: path.resolve(__dirname, '..', 'dist', 'umd'),
    library: 'Tanker',
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },

  plugins: [
    ...webpackBaseConfig.plugins,

    // Clean previous umd build (wipes output.path folder content)
    new CleanWebpackPlugin({ verbose: true }),
  ],
};
