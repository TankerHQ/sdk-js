// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { type SecretProvisionalIdentity } from '@tanker/identity';

import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from './Storage';
import { UnlockKeys } from '../Unlock/UnlockKeys';

import LocalUser from './LocalUser';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import { KeyDecryptor } from '../Resource/KeyDecryptor';
import { ResourceManager } from '../Resource/ResourceManager';
import DataProtector from '../DataProtection/DataProtector';

export class Session {
  localUser: LocalUser;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  userAccessor: UserAccessor;
  groupManager: GroupManager;
  unlockKeys: UnlockKeys;

  resourceManager: ResourceManager;
  dataProtector: DataProtector;

  constructor(localUser: LocalUser, storage: Storage, trustchain: Trustchain, client: Client) {
    this.storage = storage;
    this._trustchain = trustchain;
    this.localUser = localUser;
    this._client = client;

    this.userAccessor = new UserAccessor(storage.userStore, trustchain, localUser.trustchainId, localUser.userId);
    this.groupManager = new GroupManager(
      localUser,
      trustchain,
      storage.groupStore,
      this.userAccessor,
      client,
    );

    this.unlockKeys = new UnlockKeys(
      this.localUser,
      this._client,
    );

    this.resourceManager = new ResourceManager(
      this.storage.resourceStore,
      this._trustchain,
      new KeyDecryptor(
        this.localUser,
        this.userAccessor,
        this.storage.groupStore
      )
    );

    this.dataProtector = new DataProtector(
      this.resourceManager,
      this._client,
      this.groupManager,
      this.localUser,
      this.userAccessor,
    );
  }

  close = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.close();
  }

  nuke = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.nuke();
  }

  async revokeDevice(revokedDeviceId: string): Promise<void> {
    // sync the trustchain to be sure we have all our devices, in case we just
    // added one, or generated an unlock key
    await this._trustchain.sync();
    const user = await this.userAccessor.findUser({ userId: this.localUser.userId });
    if (!user)
      throw new Error('Cannot find the current user in the users');

    const revokeDeviceBlock = this.localUser.blockGenerator.makeDeviceRevocationBlock(user, this.storage.keyStore.currentUserKey, revokedDeviceId);
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
    const userPubKey = this.localUser.currentUserKey.publicKey;
    const block = this.localUser.blockGenerator.makeProvisionalIdentityClaimBlock(this.localUser.userId, userPubKey, provisionalUserKeys);

    await this._client.sendBlock(block);
    await this._trustchain.sync();
  }
}
