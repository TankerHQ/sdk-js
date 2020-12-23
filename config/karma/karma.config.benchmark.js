// @noflow
const webpack = require('webpack');
const os = require('os');
const fs = require('fs');

const karmaConfig = require('./karma.config.base');
const { makeBaseConfig } = require('../webpack.config.base');
const { plugin } = require('./tanker.test.config');

const outputFile = 'benchmarks.json';

class BenchmarkResultSet {
  constructor() {
    this.context = {
      date: new Date().toISOString(),
      host: os.hostname(),
    };

    this.browsers = [];

    // Non-enumerable, won't appear in JSON output
    Object.defineProperty(this, '_byBrowser', {
      value: {},
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }

  getBrowserBenchmarks(name) {
    if (!this._byBrowser[name]) {
      const benchmarks = [];
      this._byBrowser[name] = benchmarks;
      this.browsers.push({ name, benchmarks });
    }
    return this._byBrowser[name];
  }

  append(name, result) {
    const benchmarks = this.getBrowserBenchmarks(name);
    benchmarks.push({
      name: result.id,
      real_time: result.duration,
    });
  }
}

const BenchmarkReporter = function (baseReporterDecorator) {
  baseReporterDecorator(this);

  let resultSet;

  this.onBrowserStart = function () {
  };

  this.onRunStart = function () {
    resultSet = new BenchmarkResultSet();
  };

  const specComplete = function (browser, result) {
    if (result.success) {
      resultSet.append(browser.name, result);
      this.write(`Benchmark "${result.id}": ${result.duration}s\n`);
    } else if (result.skipped) {
      this.write(`Benchmark "${result.id}" SKIPPED\n`);
    } else {
      this.write(`Benchmark "${result.id}" FAILED\n`);
    }
  };

  this.specSuccess = specComplete;
  this.specFailure = specComplete;
  this.specSkipped = specComplete;
  this.onSpecComplete = specComplete;

  this.onRunComplete = function (browsers, resultInfo) {
    this.write('Benchmark run complete\n');
    fs.writeFileSync(outputFile, JSON.stringify(resultSet));
  };
};

BenchmarkReporter.$inject = ['baseReporterDecorator'];

module.exports = (config) => {
  config.set({
    ...karmaConfig,

    debugMode: true,

    plugins: [
      'karma-*',
      {'reporter:benchmarkReporter': ['type', BenchmarkReporter]},
    ],
    reporters: ['benchmarkReporter'],

    files: [
      { pattern: 'benchmarks/src/index.js', watched: true, included: true, served: true, nocache: false },
    ],

    preprocessors: {
      'benchmarks/src/index.js': ['webpack', 'sourcemap'],
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
