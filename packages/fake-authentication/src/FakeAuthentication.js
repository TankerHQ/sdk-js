//@flow
import { fetch } from '@tanker/http-utils';

export const TANKER_FAKEAUTH_VERSION = '0.0.1';

type PrivateIdentity = {
  identity: string,
  provisionalIdentity: string,
};

type PrivateIdentityResponse = {
  private_permanent_identity: string,
  private_provisional_identity?: string,
};

type PublicIdentitiesResponse = Array<{
  email: string,
  public_identity: string,
}>;

// Converts the base64 argument into the unpaddded URL safe variant (RFC 4648)
const ensureUrlSafeBase64 = (b64str: string) => b64str.replace(/[/+=]/g, (char: string) => {
  if (char === '/') return '_';
  if (char === '+') return '-';
  return '';
});

// Use a single '/' to join path elements, e.g.
//
//   pathJoin('http://a.com', 'api', 'v1/', '/users') === 'http://a.com/api/v1/users'
//
const pathJoin = (...args: Array<string>) => {
  const trimSlashes = args.map(p => p.replace(/(^\/|\/$)/g, ''));
  return trimSlashes.join('/');
};

type Config = $Exact<{ appId?: string, trustchainId?: string, url?: string }>;

const defaultHeaders = {
  'X-Tanker-Sdkversion': TANKER_FAKEAUTH_VERSION,
  'X-Tanker-Sdktype': 'fakeauth-js',
};

function doFetch(url: string, options?: Object = {}): Promise<*> {
  const fetchOptions = {
    ...options,
    headers: { ...options.headers, ...defaultHeaders },
  };

  return fetch(url, fetchOptions);
}

export default class FakeAuthentication {
  appId: string;
  baseUrl: string;

  constructor(config: Config) {
    const appId = config.appId || config.trustchainId;

    if (typeof appId !== 'string')
      throw new Error('Invalid appId option');

    this.appId = ensureUrlSafeBase64(appId);

    const serverUrl = config.url || 'https://fakeauth.tanker.io';
    this.baseUrl = pathJoin(serverUrl, 'apps', encodeURIComponent(this.appId));
  }

  async getIdentity(email?: string): Promise<PrivateIdentity> {
    let url;

    if (typeof email === 'string') {
      url = pathJoin(this.baseUrl, `private_identity?email=${encodeURIComponent(email)}`);
    } else {
      url = pathJoin(this.baseUrl, 'disposable_private_identity');
    }

    const response = await doFetch(url);

    if (!response.ok)
      throw new Error(`Server error: ${await response.text()}`);

    const json: PrivateIdentityResponse = await response.json();

    const privateIdentity = {};
    privateIdentity.identity = json.private_permanent_identity;

    if (typeof json.private_provisional_identity === 'string')
      privateIdentity.provisionalIdentity = json.private_provisional_identity;

    return privateIdentity;
  }

  async getPublicIdentities(emails: Array<string>): Promise<Array<string>> {
    if (!Array.isArray(emails) || emails.some(email => typeof email !== 'string'))
      throw new Error(`Invalid emails: ${JSON.stringify(emails)}`);

    const url = pathJoin(this.baseUrl, `public_identities?emails=${encodeURIComponent(emails.join(','))}`);
    const response = await doFetch(url);

    if (!response.ok)
      throw new Error(`Server error: ${await response.text()}`);

    const publicIdentities: PublicIdentitiesResponse = await response.json();

    return publicIdentities.map(pubId => pubId.public_identity);
  }

  async setIdentityRegistered(email: string): Promise<void> {
    if (typeof email !== 'string')
      throw new Error(`Invalid email: ${JSON.stringify(email)}`);

    const url = pathJoin(this.baseUrl, `private_identity?email=${encodeURIComponent(email)}`);

    const response = await doFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registered: true }),
    });

    if (!response.ok)
      throw new Error(`Server error: ${await response.text()}`);
  }
}
