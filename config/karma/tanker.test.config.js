const webpack = require('webpack'); // eslint-disable-line import/no-extraneous-dependencies

const plugin = new webpack.EnvironmentPlugin({
  CI: null,

  TANKER_APPD_URL: null,
  TANKER_TRUSTCHAIND_URL: null,

  TANKER_MANAGEMENT_API_ACCESS_TOKEN: null,
  TANKER_MANAGEMENT_API_DEFAULT_ENVIRONMENT_NAME: null,
  TANKER_MANAGEMENT_API_URL: null,

  TANKER_OIDC_CLIENT_SECRET: null,
  TANKER_OIDC_CLIENT_ID: null,
  TANKER_OIDC_PROVIDER: null,
  TANKER_OIDC_KEVIN_EMAIL: null,
  TANKER_OIDC_KEVIN_REFRESH_TOKEN: null,
  TANKER_OIDC_MARTINE_EMAIL: null,
  TANKER_OIDC_MARTINE_REFRESH_TOKEN: null,

  TANKER_FILEKIT_BUCKET_NAME: null,
  TANKER_FILEKIT_BUCKET_REGION: null,
  TANKER_FILEKIT_CLIENT_ID: null,
  TANKER_FILEKIT_CLIENT_SECRET: null,

  TANKER_VERIFICATION_API_TEST_TOKEN: null,
});

module.exports = { plugin };
