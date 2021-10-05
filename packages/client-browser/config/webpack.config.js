// @noflow
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin'); // eslint-disable-line @typescript-eslint/naming-convention
const { makeBaseConfig } = require('../../../config/webpack.config.base');

const webpackBaseConfig = makeBaseConfig({ mode: 'production', target: 'web', tsconfig: path.resolve(__dirname, 'tsconfig.browser.json') });

module.exports = {
  ...webpackBaseConfig,

  entry: [path.resolve(__dirname, '..', '..', '..', 'config', 'compat', 'ie11.js'), path.resolve(__dirname, '..', 'src', 'index.ts')],

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
