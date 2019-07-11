//@flow
import { encode, trim } from 'url-safe-base64';
import { generichash, utils } from '@tanker/crypto';

type PrivateIdentityResponse = {
  user_id: string,
  private_identity: string,
  private_provisional_identity: string,
};

type PublicIdentityResponse = {
  user_id: string,
  public_identity: string,
};

const { concatArrays, fromString, toSafeBase64 } = utils;

export function obfuscateUserId(trustchainId: Uint8Array, userId: string): Uint8Array {
  return toSafeBase64(generichash(concatArrays(fromString(userId), fromString(trustchainId))));
}

export default class FakeAuthentication {
  appId: string;
  url: string;

  constructor(appId: string, fakeAuthServerUrl?: string) {
    this.appId = appId;
    this.url = fakeAuthServerUrl || 'http://localhost:8080';
  }

  async getPrivateIdentity(userId: string) {
    const appId = this.appId;
    const obsUserId = obfuscateUserId(appId, userId);

    const response = await fetch(`${this.url}/apps/${trim(encode(appId))}/private_identity?user_id=${encodeURIComponent(obsUserId)}`, {
      method: 'GET',
    });
    const json: PrivateIdentityResponse = await response.json();
    return {
      ...json,
      user_id: userId,
    };
  }

  async getUserPublicIdentities(userIds: Array<string>) {
    const appId = this.appId;
    const obsUserIds = userIds.map(u => obfuscateUserId(appId, u));

    const response = await fetch(`${this.url}/apps/${trim(encode(appId))}/public_identities?user_ids=${encodeURIComponent(obsUserIds.join(','))}`, {
      method: 'GET',
    });
    const identitiesArray: Array<PublicIdentityResponse> = await response.json();
    const identities = identitiesArray.reduce((result, identity) => {
      const obsUserId = identity.user_id;
      const idx = obsUserIds.indexOf(obsUserId);
      result[userIds[idx]] = identity.public_identity; // eslint-disable-line no-param-reassign
      return result;
    }, {});

    return identities;
  }
}
