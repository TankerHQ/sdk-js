//@flow
import { encode, trim } from 'url-safe-base64';

type PrivateIdentityResponse = {
  user_id: string,
  private_identity: string,
  private_provisional_identity: string,
};

type PublicIdentityResponse = {
  user_id: string,
  public_identity: string,
};

export default class FakeAuthentication {
  appId: string;
  url: string;

  constructor(appId: string, fakeAuthServerUrl?: string) {
    this.appId = appId;
    this.url = fakeAuthServerUrl || 'http://localhost:8080';
  }

  async getPrivateIdentity(userId: string) {
    const appId = this.appId;

    const response = await fetch(`${this.url}/apps/${trim(encode(appId))}/private_identity?user_id=${encodeURIComponent(userId)}`, {
      method: 'GET',
    });
    const json: PrivateIdentityResponse = await response.json();
    return json;
  }

  async getUserPublicIdentities(userIds: Array<string>) {
    const appId = this.appId;

    const response = await fetch(`${this.url}/apps/${trim(encode(appId))}/public_identities?user_ids=${encodeURIComponent(userIds.join(','))}`, {
      method: 'GET',
    });
    const identitiesArray: Array<PublicIdentityResponse> = await response.json();
    const identities = identitiesArray.reduce((result, identity) => {
      result[identity.user_id] = identity.public_identity; // eslint-disable-line no-param-reassign
      return result;
    }, {});

    return identities;
  }
}
