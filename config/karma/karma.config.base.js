// @noflow
const path = require('path');
const { makeBaseConfig } = require('../webpack.config.base');

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
    { pattern: '**/src/__tests__/index.js', watched: true, included: true, served: true, nocache: false },
  ],

  // list of files to exclude
  exclude: ['**/*.swp'],

  // preprocess matching files before serving them to the browser
  // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
  preprocessors: {
    '**/src/__tests__/index.js': ['webpack', 'sourcemap'],
  },

  webpack: makeBaseConfig({ mode: 'production', target: 'web' }),

  // test results reporter to use
  // possible values: 'dots', 'progress'
  // available reporters: https://npmjs.org/browse/keyword/karma-reporter
  reporters: ['mocha'],

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

  browserNoActivityTimeout: 60000,

  // Concurrency level
  // how many browser should be started simultaneous
  concurrency: Infinity,

  // Sandbox does not work in un-privileged dockers, so
  // use a custom launcher when run in a docker container
  customLaunchers: {
    ChromiumInDocker: {
      base: 'ChromiumHeadless',
      flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-translate', '--disable-extensions'],
    },
    ChromeWindows: {
      base: 'BrowserStack',
      browser: 'Chrome',
      os: 'Windows',
      os_version: '10',
    },
    Chrome70Windows: {
      base: 'BrowserStack',
      browser: 'Chrome',
      browser_version: '70.0',
      os: 'Windows',
      os_version: '10',
    },
    EdgeWindows: {
      base: 'BrowserStack',
      browser: 'Edge',
      os: 'Windows',
      os_version: '10',
    },
    IeWindows: {
      base: 'BrowserStack',
      browser: 'IE',
      browser_version: '11.0',
      os: 'Windows',
      os_version: '7',
    },
    FirefoxWindows: {
      base: 'BrowserStack',
      browser: 'Firefox',
      os: 'Windows',
      os_version: '10',
    },
    Firefox64Windows: {
      base: 'BrowserStack',
      browser: 'Firefox',
      browser_version: '64.0',
      os: 'Windows',
      os_version: '8.1',
    },
    SafariMojave: {
      base: 'BrowserStack',
      browser: 'Safari',
      browser_version: '12.0',
      os: 'OS X',
      os_version: 'Mojave',
    },
  },
  browserStack: {
    project: 'sdk-js',
  },
};
