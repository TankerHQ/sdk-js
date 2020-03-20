// @flow
const fs = require('fs');

if (process.env.TANKER_CONFIG_FILEPATH && process.env.TANKER_CONFIG_NAME) {
  const allConfigs = JSON.parse(fs.readFileSync(process.env.TANKER_CONFIG_FILEPATH, { encoding: 'utf-8' }));
  const config = allConfigs[process.env.TANKER_CONFIG_NAME];
  config.oidc = allConfigs.oidc;
  config.storage = allConfigs.storage;

  global.TANKER_TEST_CONFIG = config;
} else {
  global.TANKER_TEST_CONFIG = JSON.parse(process.env.TANKER_CI_CONFIG || '');
}

module.exports = { TANKER_TEST_CONFIG: global.TANKER_TEST_CONFIG };
