// @flow
import { tcrypto, createUserSecretBinary, obfuscateUserId, utils } from '@tanker/crypto';
import { type DataStore, mergeSchemas } from '@tanker/datastore-base';

import dataStoreConfig, { makePrefix } from './dataStoreConfig';
import Generator, { type GeneratorUserResult, type GeneratorRevocationResult, type GeneratorKeyResult, type GeneratorUserGroupResult, type GeneratorUserGroupAdditionResult, type GeneratorDevice, type GeneratorUser } from './Generator';
import TrustchainStore from '../Trustchain/TrustchainStore';
import TrustchainVerifier from '../Trustchain/TrustchainVerifier';
import Trustchain from '../Trustchain/Trustchain';
import { type DeviceType } from '../Unlock/unlock';
import BlockGenerator from '../Blocks/BlockGenerator';

import Storage from '../Session/Storage';
import KeySafe from '../Session/KeySafe';
import Keystore from '../Session/Keystore';
import UserStore from '../Users/UserStore';
import GroupStore from '../Groups/GroupStore';
import GroupUpdater from '../Groups/GroupUpdater';
import UnverifiedStore from '../UnverifiedStore/UnverifiedStore';

export default class TrustchainBuilder {
  dataStore: DataStore<*>;
  generator: Generator;
  trustchainStore: TrustchainStore;
  trustchainVerifier: TrustchainVerifier;
  trustchain: Trustchain;
  keyStore: Keystore;
  userStore: UserStore;
  groupStore: GroupStore;
  groupUpdater: GroupUpdater;
  unverifiedStore: UnverifiedStore;
  dataStoreConfig: Object;
  trustchainKeyPair: Object;

  async init(skipRootBlock?: bool) {
    const schemas = mergeSchemas(
      Keystore.schemas,
      UserStore.schemas,
      TrustchainStore.schemas,
      GroupStore.schemas,
      UnverifiedStore.schemas,
    );

    this.trustchainKeyPair = tcrypto.makeSignKeyPair();

    this.generator = await Generator.open(this.trustchainKeyPair);

    this.dataStoreConfig = { ...dataStoreConfig, schemas, dbName: `trustchain-${makePrefix()}` };

    const { trustchainId } = this.generator;

    const userId = obfuscateUserId(trustchainId, 'let try this for now');
    const userSecret = createUserSecretBinary(utils.toBase64(trustchainId), 'let try this for now');

    const storage = new Storage(this.dataStoreConfig);
    await storage.open(userId, userSecret);

    this.dataStore = storage._datastore; // eslint-disable-line no-underscore-dangle
    this.keyStore = storage.keyStore;
    this.userStore = storage.userStore;
    this.groupStore = storage.groupStore;
    this.trustchainStore = storage.trustchainStore;
    this.unverifiedStore = storage.unverifiedStore;

    this.groupUpdater = new GroupUpdater(this.groupStore, this.keyStore);
    this.trustchainVerifier = new TrustchainVerifier(trustchainId, storage, this.groupUpdater);
    const trustchainPuller: any = {};
    this.trustchain = new Trustchain(this.trustchainStore, this.trustchainVerifier, trustchainPuller, this.unverifiedStore);

    // add the root entry to the trustchain
    if (!skipRootBlock) {
      const rootEntry = this.generator.root.entry;
      await this.trustchainStore.addTrustchainCreation(rootEntry);
      await this.trustchainVerifier.verifyTrustchainCreation(rootEntry);
    }
  }

  async addUserV1(userName: string): Promise<GeneratorUserResult> {
    const result = await this.generator.newUserCreationV1(userName);
    await this.unverifiedStore.addUnverifiedUserEntries([result.entry]);
    return result;
  }

  async addUserV3(userName: string, deviceType?: DeviceType): Promise<GeneratorUserResult> {
    const result = await this.generator.newUserCreationV3(userName, { deviceType });
    await this.unverifiedStore.addUnverifiedUserEntries([result.entry]);
    return result;
  }

  async addDeviceV1(args: { id: string, parentIndex?: number }): Promise<GeneratorUserResult> {
    const { id, parentIndex } = args;
    const result = await this.generator.newDeviceCreationV1({ userId: id, parentIndex: parentIndex || 0 });
    await this.unverifiedStore.addUnverifiedUserEntries([result.entry]);
    return result;
  }

  async addDeviceV3(args: { id: string, parentIndex?: number, deviceType?: DeviceType }): Promise<GeneratorUserResult> {
    const { id, parentIndex, deviceType } = args;
    const result = await this.generator.newDeviceCreationV3({ userId: id, parentIndex: parentIndex || 0, deviceType });
    await this.unverifiedStore.addUnverifiedUserEntries([result.entry]);
    return result;
  }

  async addKeyPublishToDevice(args: {from: GeneratorUserResult, to: GeneratorUserResult, symmetricKey?: Uint8Array, resourceId?: Uint8Array}): Promise<GeneratorKeyResult> {
    const { symmetricKey, to, from, resourceId } = args;

    const result = await this.generator.newKeyPublishToDevice({ symmetricKey, toDevice: to.device, fromDevice: from.device, resourceId });
    await this.unverifiedStore.addUnverifiedKeyPublishes([result.entry]);
    return result;
  }

  async addKeyPublishToUser(args: {from: GeneratorUserResult, to: GeneratorUserResult, symmetricKey?: Uint8Array, resourceId?: Uint8Array}): Promise<GeneratorKeyResult> {
    const { symmetricKey, to, from, resourceId } = args;
    const result = await this.generator.newKeyPublishToUser({ symmetricKey, toUser: to.user, fromDevice: from.device, resourceId });
    await this.unverifiedStore.addUnverifiedKeyPublishes([result.entry]);
    return result;
  }

  async addKeyPublishToUserGroup(args: {from: GeneratorUserResult, to: GeneratorUserGroupResult, symmetricKey?: Uint8Array, resourceId?: Uint8Array}): Promise<GeneratorKeyResult> {
    const { symmetricKey, to, from, resourceId } = args;
    const result = await this.generator.newKeyPublishToUserGroup({ symmetricKey, toGroup: to, fromDevice: from.device, resourceId });
    await this.unverifiedStore.addUnverifiedKeyPublishes([result.entry]);
    return result;
  }

  async addDeviceRevocationV1(from: GeneratorUserResult, to: GeneratorUserResult): Promise<GeneratorRevocationResult> {
    const result = await this.generator.newDeviceRevocationV1(from.device, { id: to.device.id });
    await this.unverifiedStore.addUnverifiedUserEntries([result.entry]);
    return result;
  }

  async addDeviceRevocationV2(from: GeneratorUserResult, to: GeneratorUserResult): Promise<GeneratorRevocationResult> {
    const result = await this.generator.newDeviceRevocationV2(from.device, { id: to.device.id });
    await this.unverifiedStore.addUnverifiedUserEntries([result.entry]);
    return result;
  }

  async addUserGroupCreation(from: GeneratorUserResult, members: Array<string>): Promise<GeneratorUserGroupResult> {
    const result = await this.generator.newUserGroupCreation(from.device, members);
    await this.unverifiedStore.addUnverifiedUserGroups([result.entry]);
    return result;
  }

  async addUserGroupAddition(from: GeneratorUserResult, group: GeneratorUserGroupResult, members: Array<string>): Promise<GeneratorUserGroupAdditionResult> {
    const result = await this.generator.newUserGroupAddition(from.device, group, members);
    await this.unverifiedStore.addUnverifiedUserGroups([result.entry]);
    return result;
  }

  userId(userName: string): Uint8Array {
    return this.generator.userId(userName);
  }

  userIds(userNames: Array<string>): Array<Uint8Array> {
    return this.generator.userIds(userNames);
  }

  async getKeystoreOfDevice(user: GeneratorUser, device: GeneratorDevice): Promise<Keystore> {
    // $FlowExpectedError we are making a read-only key store for tests, no need for a  real database
    const keystore = new Keystore(null);
    keystore._safe = new KeySafe({ // eslint-disable-line no-underscore-dangle
      deviceId: utils.toBase64(device.id),
      signaturePair: device.signKeys,
      encryptionPair: device.encryptionKeys,
      userKeys: user.userKeys ? [user.userKeys] : [],
      encryptedUserKeys: [],
      userSecret: new Uint8Array(32),
    });
    keystore._userKeys = {}; // eslint-disable-line no-underscore-dangle
    if (user.userKeys)
      keystore._userKeys[utils.toBase64(user.userKeys.publicKey)] = user.userKeys; // eslint-disable-line no-underscore-dangle
    return keystore;
  }

  async getBlockGeneratorOfDevice(device: GeneratorDevice): Promise<BlockGenerator> {
    return new BlockGenerator(
      this.generator.trustchainId,
      device.signKeys.privateKey,
      device.id
    );
  }
}

export async function makeTrustchainBuilder(skipRootBlock?: bool): Promise<TrustchainBuilder> {
  const builder = new TrustchainBuilder();
  await builder.init(skipRootBlock);

  return builder;
}
