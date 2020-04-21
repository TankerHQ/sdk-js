// @flow
const getFakeAuthUrl = (apiUrl) => {
  if (apiUrl.includes('api.')) {
    return apiUrl.replace('api.', 'fakeauth.');
  }
  return 'http://127.0.0.1:4249';
};

// $FlowIKnow TANKER_TEST_CONFIG is a global magic variable passed by Karma or imported in Node.js
const testConfig = TANKER_TEST_CONFIG; // eslint-disable-line no-undef
const tankerUrl = testConfig.url;
const fakeAuthUrl = getFakeAuthUrl(tankerUrl);
const idToken = testConfig.idToken;
const oidcSettings = testConfig.oidc;
const storageSettings = testConfig.storage;

export { tankerUrl, fakeAuthUrl, idToken, oidcSettings, storageSettings };
