const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin'); // eslint-disable-line @typescript-eslint/naming-convention
const HtmlWebpackPlugin = require('html-webpack-plugin'); // eslint-disable-line @typescript-eslint/naming-convention

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
    port: 3008,
    hot: true,
    static: {
      watch: { ignored: /node_modules/ },
    },
  },
};
