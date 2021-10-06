const path = require('path');

// eslint-disable-next-line import/extensions
const { customLaunchers } = require('./launchers.js');

module.exports = {
  // base path that will be used to resolve all patterns (eg. files, exclude)
  basePath: path.resolve(__dirname, '..', '..', 'packages'),

  // frameworks to use
  // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
  frameworks: ['mocha'],

  // options for the mocha client
  client: {
    mocha: {
      timeout: 10000,
    },
  },

  // list of files / patterns to load in the browser
  files: [
    // Promise polyfill required for Dexie 3 in IE11
    { pattern: '../config/compat/ie11.js', included: true, served: true },
    { pattern: '**/__tests__/index.ts', watched: true, included: true, served: true, nocache: false },
  ],

  // list of files to exclude
  exclude: ['**/*.swp'],

  // preprocess matching files before serving them to the browser
  // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
  preprocessors: {
    '../config/compat/ie11.js': ['webpack'],
    '**/__tests__/index.ts': ['webpack', 'sourcemap'],
  },

  // test results reporter to use
  // possible values: 'dots', 'progress'
  // available reporters: https://npmjs.org/browse/keyword/karma-reporter
  reporters: ['mocha', 'BrowserStack'],

  mochaReporter: {
    output: 'full',
    showDiff: 'unified',
  },

  reportSlowerThan: 200,

  // web server port
  port: 9876,

  // enable / disable colors in the output (reporters and logs)
  colors: true,

  // start these browsers
  // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
  browsers: ['ChromiumHeadless'],

  browserNoActivityTimeout: 120000,
  browserDisconnectTimeout: 40000,

  // Concurrency level
  // how many browser should be started simultaneous
  concurrency: Infinity,

  customLaunchers,

  browserStack: {
    project: 'sdk-js',
    timeout: 1800,
  },

  hostname: 'bs-local.com',
};
