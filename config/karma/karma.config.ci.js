// @noflow
const fs = require('fs');
const webpack = require('webpack');

const karmaConfig = require('./karma.config.base');
const { makeBaseConfig } = require('../webpack.config.base');

const getConfig = () => {
  if (process.env.TANKER_CONFIG_FILEPATH && process.env.TANKER_CONFIG_NAME) {
    const config = JSON.parse(fs.readFileSync(process.env.TANKER_CONFIG_FILEPATH, { encoding: 'utf-8' }));
    const envConfig = config[process.env.TANKER_CONFIG_NAME];
    envConfig.oidc = config.oidc;
    envConfig.storage = config.storage;
    return envConfig;
  }
  if (process.env.TANKER_CI_CONFIG) {
    return JSON.parse(process.env.TANKER_CI_CONFIG);
  }
  throw new Error('Missing env variables: TANKER_CONFIG_FILEPATH & TANKER_CONFIG_NAME or TANKER_CI_CONFIG must be set');
};

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
          TANKER_TEST_CONFIG: JSON.stringify(getConfig()),
          'process.env': {
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
