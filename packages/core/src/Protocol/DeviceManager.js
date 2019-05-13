// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { type SecretProvisionalIdentity } from '@tanker/identity';

import { Client } from '../Network/Client';
import LocalUser from '../Session/LocalUser';
import Trustchain from '../Trustchain/Trustchain';
import Storage from '../Session/Storage';
import UserAccessor from '../Users/UserAccessor';

export type KeyResourceId = {
  key: Uint8Array,
  resourceId: Uint8Array,
};

export default class DeviceManager {
  _trustchain: Trustchain;
  _client: Client;
  _localUser: LocalUser;
  _storage: Storage;
  _userAccessor: UserAccessor;

  constructor(
    trustchain: Trustchain,
    client: Client,
    localUser: LocalUser,
    storage: Storage,
    userAccessor: UserAccessor,
  ) {
    this._trustchain = trustchain;
    this._client = client;
    this._storage = storage;
    this._localUser = localUser;
    this._userAccessor = userAccessor;
  }

  async revokeDevice(revokedDeviceId: string): Promise<void> {
    // sync the trustchain to be sure we have all our devices, in case we just
    // added one, or generated an unlock key
    await this._trustchain.sync();
    const user = await this._userAccessor.findUser({ userId: this._localUser.userId });
    if (!user)
      throw new Error('Cannot find the current user in the users');

    const revokeDeviceBlock = this._localUser.blockGenerator.makeDeviceRevocationBlock(user, this._storage.keyStore.currentUserKey, revokedDeviceId);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._trustchain.sync();
  }

  async claimProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity, verificationCode: string): Promise<void> {
    if (provisionalIdentity.target !== 'email')
      throw new Error(`unsupported provisional identity target ${provisionalIdentity.target}`);

    const appProvisionalUserPrivateSignatureKey = utils.fromBase64(provisionalIdentity.private_signature_key);
    const appProvisionalUserPrivateEncryptionKey = utils.fromBase64(provisionalIdentity.private_encryption_key);
    const tankerKeys = await this._client.getProvisionalIdentityKeys({ email: provisionalIdentity.value }, verificationCode);
    const provisionalUserKeys = {
      ...tankerKeys,
      appEncryptionKeyPair: tcrypto.getEncryptionKeyPairFromPrivateKey(appProvisionalUserPrivateEncryptionKey),
      appSignatureKeyPair: tcrypto.getSignatureKeyPairFromPrivateKey(appProvisionalUserPrivateSignatureKey),
    };
    const userPubKey = this._localUser.currentUserKey.publicKey;
    const block = this._localUser.blockGenerator.makeProvisionalIdentityClaimBlock(this._localUser.userId, userPubKey, provisionalUserKeys);

    await this._client.sendBlock(block);
    await this._trustchain.sync();
  }
}
