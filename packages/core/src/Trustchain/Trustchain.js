// @flow

import TrustchainPuller from './TrustchainPuller';
import TrustchainVerifier from './TrustchainVerifier';
import { Client } from '../Network/Client';
import TrustchainStore from './TrustchainStore';
import Storage from '../Session/Storage';
import GroupUpdater from '../Groups/GroupUpdater';
import UnverifiedStore from './UnverifiedStore/UnverifiedStore';
import type { VerifiedKeyPublish, VerifiedDeviceCreation } from '../Blocks/entries';

export default class Trustchain {
  _trustchainStore: TrustchainStore;
  _trustchainPuller: TrustchainPuller;
  _trustchainVerifier: TrustchainVerifier;
  _unverifiedStore: UnverifiedStore;

  constructor(trustchainStore: TrustchainStore, trustchainVerifier: TrustchainVerifier, trustchainPuller: TrustchainPuller, unverifiedStore: UnverifiedStore) {
    this._trustchainStore = trustchainStore;
    this._trustchainPuller = trustchainPuller;
    this._trustchainVerifier = trustchainVerifier;
    this._unverifiedStore = unverifiedStore;
  }

  static async open(client: Client, trustchainId: Uint8Array, userId: Uint8Array, storage: Storage): Promise<Trustchain> {
    const groupUpdater = new GroupUpdater(storage.groupStore, storage.keyStore);
    const trustchainVerifier = new TrustchainVerifier(trustchainId, storage, groupUpdater);
    const trustchainPuller = new TrustchainPuller(client, userId, storage.trustchainStore, storage.unverifiedStore, trustchainVerifier);
    return new Trustchain(storage.trustchainStore, trustchainVerifier, trustchainPuller, storage.unverifiedStore);
  }

  async close() {
    if (this._trustchainPuller)
      await this._trustchainPuller.close();
  }

  async updateUserStore(userIds: Array<Uint8Array>) {
    return this._trustchainVerifier.updateUserStore(userIds);
  }

  async ready() {
    await this._trustchainPuller.scheduleCatchUp([], []); // await to avoid unhandled rejections
    return this._trustchainPuller.succeededOnce();
  }

  async sync(userIds?: Array<Uint8Array>, groupIds?: Array<Uint8Array>): Promise<void> {
    return this._trustchainPuller.scheduleCatchUp(userIds, groupIds);
  }

  async updateGroupStore(groupIds: Array<Uint8Array>) {
    return this._trustchainVerifier.updateGroupStore(groupIds);
  }

  async verifyDevice(deviceId: Uint8Array): Promise<?VerifiedDeviceCreation> {
    const unverifiedDevice = await this._unverifiedStore.findUnverifiedDeviceByHash(deviceId);
    if (!unverifiedDevice)
      return null;
    return this._trustchainVerifier.verifyDeviceCreation(unverifiedDevice);
  }

  async findKeyPublish(resourceId: Uint8Array): Promise<?VerifiedKeyPublish> {
    const unverifiedKP = await this._unverifiedStore.findUnverifiedKeyPublish(resourceId);
    if (!unverifiedKP)
      return null;
    const verifiedEntries = await this._trustchainVerifier.verifyKeyPublishes([unverifiedKP]);
    return verifiedEntries.length ? verifiedEntries[0] : null;
  }
}
