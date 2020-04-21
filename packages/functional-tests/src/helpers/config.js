// @flow
// Flow trickery, webpack will actually throw for undefined value
//  https://github.com/webpack/webpack/blob/0740909b901afa69fcc1657a03215d1e011bb5c3/lib/EnvironmentPlugin.js#L41
const tankerUrl = process.env.TANKER_TRUSTCHAIND_URL || '';
const fakeAuthUrl = process.env.TANKER_FAKE_AUTH_URL || '';
const idToken = process.env.TANKER_ID_TOKEN || '';
const oidcSettings = {
  googleAuth: {
    clientSecret: process.env.TANKER_OIDC_CLIENT_SECRET || '',
    clientId: process.env.TANKER_OIDC_CLIENT_ID || '',
    provider: process.env.TANKER_OIDC_PROVIDER || '',
    users: {
      martine: {
        email: process.env.TANKER_OIDC_MARTINE_EMAIL || '',
        refreshToken: process.env.TANKER_OIDC_MARTINE_REFRESH_TOKEN || '',
      },
      kevin: {
        email: process.env.TANKER_OIDC_KEVIN_EMAIL || '',
        refreshToken: process.env.TANKER_OIDC_KEVIN_REFRESH_TOKEN || '',
      },
    },
  },
};
const storageSettings = {
  s3: {
    bucketName: process.env.TANKER_FILEKIT_BUCKET_NAME || '',
    bucketRegion: process.env.TANKER_FILEKIT_BUCKET_REGION || '',
    clientId: process.env.TANKER_FILEKIT_CLIENT_ID || '',
    clientSecret: process.env.TANKER_FILEKIT_CLIENT_SECRET || '',
  },
};

export { tankerUrl, fakeAuthUrl, idToken, oidcSettings, storageSettings };
