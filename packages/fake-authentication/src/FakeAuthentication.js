//@flow
import uuid from 'uuid';
import { generichash, utils } from '@tanker/crypto';

type PrivateIdentity = {
  userId: string,
  privateIdentity: string,
  privateProvisionalIdentity: string,
};

const { concatArrays, fromString, toSafeBase64, fromBase64 } = utils;

export function obfuscateUserId(trustchainId: string, userId: string): string {
  return toSafeBase64(generichash(concatArrays(fromString(userId), fromString(trustchainId))));
}

type PublicIdentityResponse = {
  user_id: string,
  public_identity: string,
};

type PrivateIdentityResponse = {
  user_id: string,
  private_identity: string,
  private_provisional_identity: string,
};


export default class FakeAuthentication {
  appId: string;
  url: string;

  constructor(appId: string, fakeAuthServerUrl?: string) {
    this.appId = appId;
    this.url = fakeAuthServerUrl || 'https://staging-fakeauth.tanker.io';
  }

  async getPrivateIdentity(pUserId?: string): Promise<PrivateIdentity> {
    const userId: string = pUserId || uuid.v4();

    const appId = this.appId;
    const obsUserId = obfuscateUserId(appId, userId);

    const response = await fetch(`${this.url}/apps/${toSafeBase64(fromBase64(appId))}/private_identity?user_id=${encodeURIComponent(obsUserId)}`, {
      method: 'GET',
    });
    if (!response.ok)
      throw new Error(`Server error: ${await response.text()}`);
    const json: PrivateIdentityResponse = await response.json();
    return {
      privateIdentity: json.private_identity,
      privateProvisionalIdentity: json.private_provisional_identity,
      userId,
    };
  }

  async generateUserId(): string {
    return uuid.v4();
  }

  async getPublicIdentities(userIds: Array<string>): Promise<Array<string>> {
    const obsUserIds = userIds.map(u => obfuscateUserId(this.appId, u));

    const response = await fetch(`${this.url}/apps/${toSafeBase64(fromBase64(this.appId))}/public_identities?user_ids=${encodeURIComponent(obsUserIds.join(','))}`, {
      method: 'GET',
    });
    if (!response.ok)
      throw new Error(`Server error: ${await response.text()}`);
    const identitiesArray: Array<PublicIdentityResponse> = await response.json();

    const identities = obsUserIds.reduce((result, obsId) => {
      const identity = identitiesArray.filter(i => i.user_id === obsId)[0];
      if (!identity)
        throw new Error(`Cannot find the public key of${obsId}`);
      result.push(identity.public_identity);
      return result;
    }, []);

    return identities;
  }
}
