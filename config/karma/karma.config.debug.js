// @noflow
const karmaConfig = require('./karma.config.base');

module.exports = (config) => {
  config.set({
    ...karmaConfig,

    webpack: {
      ...karmaConfig.webpack,
      mode: 'development',
    },

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,
  });
};
