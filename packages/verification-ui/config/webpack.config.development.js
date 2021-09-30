// @noflow
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const { makeBaseConfig } = require('../../../config/webpack.config.base');

const webpackBaseConfig = makeBaseConfig({ mode: 'development', target: 'web', react: true, hmre: true, tsconfig: path.resolve(__dirname, 'tsconfig.development.json') });

module.exports = {
  ...webpackBaseConfig,

  entry: [path.resolve(__dirname, '..', 'example', 'index.ts')],

  plugins: [
    ...webpackBaseConfig.plugins,

    new HtmlWebpackPlugin({ template: path.resolve(__dirname, '..', 'example', 'index.html') }),
    new CleanWebpackPlugin({ verbose: true }),
  ],

  devServer: {
    historyApiFallback: true,
    host: '127.0.0.1',
    // host: '0.0.0.0',
    hot: true,
    overlay: true,
    watchOptions: { ignored: /node_modules/ },
    port: 3008,
  },
};
