// @flow

import { utils } from '@tanker/crypto';
import Trustchain from '../Trustchain/Trustchain';
import UserAccessor from '../Users/UserAccessor';
import Storage from './Storage';
import { UnlockKeys } from '../Unlock/UnlockKeys';

import { type SessionData } from '../Tokens/SessionTypes';
import GroupManager from '../Groups/Manager';

import { Client } from '../Network/Client';
import BlockGenerator from '../Blocks/BlockGenerator';
import Encryptor from '../Encryption/Encryptor';

export class Session {
  sessionData: SessionData;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  blockGenerator: BlockGenerator;
  userAccessor: UserAccessor;
  groupManager: GroupManager;
  encryptor: Encryptor;
  unlockKeys: UnlockKeys;

  constructor(sessionData: SessionData, storage: Storage, trustchain: Trustchain, client: Client) {
    this.storage = storage;
    this._trustchain = trustchain;
    this.sessionData = sessionData;
    this._client = client;

    this.blockGenerator = new BlockGenerator(
      sessionData.trustchainId,
      storage.keyStore.privateSignatureKey,
      sessionData.deviceId,
    );

    this.userAccessor = new UserAccessor(storage.userStore, trustchain, sessionData.trustchainId, sessionData.userId);
    this.groupManager = new GroupManager(
      sessionData.trustchainId,
      trustchain,
      storage.groupStore,
      this.userAccessor,
      this.blockGenerator,
      client,
    );
    this.encryptor = new Encryptor(
      this.sessionData,
      this.storage,
      this._client,
      this._trustchain,
      this.groupManager,
      this.userAccessor,
    );
    this.unlockKeys = new UnlockKeys(
      this.sessionData,
      this.storage.keyStore,
      this._client,
    );
  }

  get userId(): Uint8Array {
    return this.sessionData.userId;
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
    const user = await this.userAccessor.findUser({ hashedUserId: this.sessionData.userId });
    if (!user)
      throw new Error('Cannot find the current user in the users');

    const publicEncryptionKeys = user.devices
      .filter(device => device.revokedAt === Number.MAX_SAFE_INTEGER && device.deviceId !== revokedDeviceId);

    const userKeys = await this.storage.keyStore.rotateUserKeys(publicEncryptionKeys);
    const revocationRecord = {
      device_id: utils.fromBase64(revokedDeviceId),
      user_keys: userKeys
    };

    const revokeDeviceBlock = this.blockGenerator.revokeDevice(revocationRecord);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._trustchain.forceSync([], []);
  }
}
