// @noflow
const webpack = require('webpack');

const karmaConfig = require('./karma.config.base');
const { makeBaseConfig } = require('../webpack.config.base');

module.exports = (config) => {
  config.set({
    ...karmaConfig,

    mochaReporter: {
      ...karmaConfig.mochaReporter,
      symbols: {
        success: '+',
        info: '#',
        warning: '!',
        error: 'x',
      },
    },

    webpack: makeBaseConfig({
      mode: 'production',
      target: 'web',
      react: true,
      devtool: 'eval',
      plugins: [
        new webpack.DefinePlugin({
          'process.env': {
            TANKER_TOKEN: JSON.stringify(process.env.TANKER_TOKEN),
            TANKER_URL: JSON.stringify(process.env.TANKER_URL),
            TANKER_COMMON_SETTINGS: JSON.stringify(process.env.TANKER_COMMON_SETTINGS),
            CI: JSON.stringify(process.env.CI),
          },
        }),
      ]
    }),

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,
  });
};
