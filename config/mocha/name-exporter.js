'use strict';

const fs = require('fs');
const mocha = require('mocha');
const {
  EVENT_RUN_END,
  EVENT_TEST_BEGIN,
} = mocha.Runner.constants;

const prefix = 'functional-tests (client-node) ';

function removePrefix(str) {
  if (!str.startsWith(prefix)) {
    return str;
  }
  return str.substring(prefix.length);
}

// NameExporter lists test names as a JSON array.
// It should be run with `--dry-run` enabled as it does not rely on test results.
// Options:
// - `outputFile`: write output to the specified file instead of the console
//
// example output:
// [
//   "start has STOPPED status before start",
//   "start throws when having configured a non existing app",
//   "start throws when giving an invalid identity",
//   [...]
//   "session token (2FA) can use verifyIdentity to get a session token when Ready"
// ]
function NameExporter(runner, options) {
  const testNames = [];

  // eslint-disable-next-line no-console
  let log = console.log;
  if (options.reporterOption?.outputFile) {
    log = (data) => fs.writeFileSync(options.reporterOption.outputFile, data);
  }

  runner
    .on(EVENT_TEST_BEGIN, test => {
      testNames.push(removePrefix(test.fullTitle()));
    })
    .once(EVENT_RUN_END, () => {
      log(JSON.stringify(testNames, null, 2));
    });
}

module.exports = NameExporter;
