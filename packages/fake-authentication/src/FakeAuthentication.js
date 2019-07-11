//@flow
import uuid from 'uuid';
import { generichash, utils } from '@tanker/crypto';

type PrivateIdentityResponse = {
  userId: string,
  privateIdentity: string,
  privateProvisionalIdentity: string,
};

const { concatArrays, fromString, toSafeBase64, fromBase64 } = utils;

export function obfuscateUserId(trustchainId: Uint8Array, userId: string): Uint8Array {
  return toSafeBase64(generichash(concatArrays(fromString(userId), fromString(trustchainId))));
}

export default class FakeAuthentication {
  appId: string;
  url: string;

  constructor(appId: string, fakeAuthServerUrl?: string) {
    this.appId = appId;
    this.url = fakeAuthServerUrl || 'https://staging-fakeauth.tanker.io';
  }

  async getPrivateIdentity(pUserId?: string) {
    let userId = pUserId;
    if (!pUserId)
      userId = uuid.v4();

    const appId = this.appId;
    const obsUserId = obfuscateUserId(appId, userId);

    const response = await fetch(`${this.url}/apps/${toSafeBase64(fromBase64(appId))}/private_identity?user_id=${encodeURIComponent(obsUserId)}`, {
      method: 'GET',
    });
    const json: PrivateIdentityResponse = await response.json();
    console.log('jsonm:', json, toSafeBase64(fromBase64(appId)));
    return {
      privateIdentity: json.private_identity,
      privateProvisionalIdentity: json.private_provisional_identity,
      userId,
    };
  }

  async getUserPublicIdentities(userIds: Array<string>) {
    const appId = this.appId;
    const obsUserIds = userIds.map(u => obfuscateUserId(appId, u));

    const response = await fetch(`${this.url}/apps/${toSafeBase64(fromBase64(appId))}/public_identities?user_ids=${encodeURIComponent(obsUserIds.join(','))}`, {
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
