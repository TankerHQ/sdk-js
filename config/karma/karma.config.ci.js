// @noflow
const webpack = require('webpack');

const karmaConfig = require('./karma.config.base');
const { makeBaseConfig } = require('./karma.webpack.config');
const { plugin } = require('./tanker.test.config');

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
      plugins: [plugin],
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
