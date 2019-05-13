// @flow
import { tcrypto, utils } from '@tanker/crypto';
import { type DataStore, mergeSchemas } from '@tanker/datastore-base';
import { createIdentity, type ProvisionalUserKeys, type PublicProvisionalUser } from '@tanker/identity';

import { extractUserData } from '../UserData';

import dataStoreConfig, { makePrefix } from './TestDataStore';
import Generator, {
  type GeneratorUserResult,
  type GeneratorKeyResult,
  type GeneratorUserGroupResult,
  type GeneratorUserGroupAdditionResult,
  type GeneratorDevice,
  type GeneratorUser,
  type GeneratorProvisionalIdentityClaimResult,
} from './Generator';
import TrustchainStore from '../Trustchain/TrustchainStore';
import TrustchainVerifier from '../Trustchain/TrustchainVerifier';
import Trustchain from '../Trustchain/Trustchain';

import Storage from '../Session/Storage';
import KeySafe from '../Session/KeySafe';
import Keystore from '../Session/Keystore';
import UserStore from '../Users/UserStore';
import GroupStore from '../Groups/GroupStore';
import GroupUpdater from '../Groups/GroupUpdater';
import UnverifiedStore from '../Trustchain/UnverifiedStore/UnverifiedStore';

import { userGroupEntryFromBlock, deviceCreationFromBlock, provisionalIdentityClaimFromBlock } from '../Blocks/entries';
import { type ProvisionalPublicKey } from '../Blocks/payloads';

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

    const userIdString = 'let try this for now';
    const identity = await createIdentity(utils.toBase64(trustchainId), utils.toBase64(this.trustchainKeyPair.privateKey), userIdString);
    const userData = extractUserData(identity);

    const storage = new Storage(this.dataStoreConfig);
    await storage.open(userData.userId, userData.userSecret);
    storage.userStore.setCallbacks({
      deviceCreation: async () => {},
      deviceRevocation: async () => {},
      claim: async () => ({
        id: '',
        appEncryptionKeyPair: tcrypto.makeEncryptionKeyPair(),
        tankerEncryptionKeyPair: tcrypto.makeEncryptionKeyPair()
      })
    });

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
      await this.trustchainStore.setTrustchainPublicKey((rootEntry.payload_unverified: any).public_signature_key);
    }
  }

  async addUserV3(userName: string): Promise<GeneratorUserResult> {
    const result = await this.generator.newUserCreationV3(userName);
    await this.unverifiedStore.addUnverifiedUserEntries([deviceCreationFromBlock(result.block)]);
    return result;
  }

  async addDeviceV3(args: { id: string, parentIndex?: number }): Promise<GeneratorUserResult> {
    const { id, parentIndex } = args;
    const result = await this.generator.newDeviceCreationV3({ userId: id, parentIndex: parentIndex || 0 });
    await this.unverifiedStore.addUnverifiedUserEntries([deviceCreationFromBlock(result.block)]);
    return result;
  }

  async addKeyPublishToDevice(args: {from: GeneratorUserResult, to: GeneratorUserResult, symmetricKey?: Uint8Array, resourceId?: Uint8Array}): Promise<GeneratorKeyResult> {
    const { symmetricKey, to, from, resourceId } = args;

    const result = await this.generator.newKeyPublishToDevice({ symmetricKey, toDevice: to.device, fromDevice: from.device, resourceId });
    await this.unverifiedStore.addUnverifiedKeyPublishes([result.unverifiedKeyPublish]);
    return result;
  }

  async addKeyPublishToUser(args: {from: GeneratorUserResult, to: GeneratorUserResult, symmetricKey?: Uint8Array, resourceId?: Uint8Array}): Promise<GeneratorKeyResult> {
    const { symmetricKey, to, from, resourceId } = args;
    const result = await this.generator.newKeyPublishToUser({ symmetricKey, toUser: to.user, fromDevice: from.device, resourceId });
    await this.unverifiedStore.addUnverifiedKeyPublishes([result.unverifiedKeyPublish]);
    return result;
  }

  async addKeyPublishToUserGroup(args: {from: GeneratorUserResult, to: GeneratorUserGroupResult, symmetricKey?: Uint8Array, resourceId?: Uint8Array}): Promise<GeneratorKeyResult> {
    const { symmetricKey, to, from, resourceId } = args;
    const result = await this.generator.newKeyPublishToUserGroup({ symmetricKey, toGroup: to, fromDevice: from.device, resourceId });
    await this.unverifiedStore.addUnverifiedKeyPublishes([result.unverifiedKeyPublish]);
    return result;
  }

  async addKeyPublishToProvisionalUser(args: {from: GeneratorUserResult, to: ProvisionalPublicKey, symmetricKey?: Uint8Array, resourceId?: Uint8Array}): Promise<GeneratorKeyResult> {
    const { symmetricKey, to, from, resourceId } = args;
    const result = await this.generator.newKeyPublishToProvisionalUser({ symmetricKey, toProvisionalUserPublicKey: to, fromDevice: from.device, resourceId });
    await this.unverifiedStore.addUnverifiedKeyPublishes([result.unverifiedKeyPublish]);
    return result;
  }

  async addUserGroupCreation(from: GeneratorUserResult, members: Array<string>, provisionalMembers: Array<PublicProvisionalUser> = []): Promise<GeneratorUserGroupResult> {
    const result = await this.generator.newUserGroupCreation(from.device, members, provisionalMembers);
    await this.unverifiedStore.addUnverifiedUserGroups([userGroupEntryFromBlock(result.block)]);
    return result;
  }

  async addUserGroupAddition(from: GeneratorUserResult, group: GeneratorUserGroupResult, members: Array<string>, provisionalMembers: Array<PublicProvisionalUser> = []): Promise<GeneratorUserGroupAdditionResult> {
    const result = await this.generator.newUserGroupAddition(from.device, group, members, provisionalMembers);
    await this.unverifiedStore.addUnverifiedUserGroups([userGroupEntryFromBlock(result.block)]);
    return result;
  }

  async addProvisionalIdentityClaim(from: GeneratorUserResult, provisionalUserKeys: ProvisionalUserKeys): Promise<GeneratorProvisionalIdentityClaimResult> {
    const result = await this.generator.newProvisionalIdentityClaim(from.device, provisionalUserKeys);
    await this.unverifiedStore.addUnverifiedProvisionalIdentityClaimEntries([provisionalIdentityClaimFromBlock(result.block)]);
    return result;
  }

  async getKeystoreOfDevice(user: GeneratorUser, device: GeneratorDevice, provisionalIdentities: Array<ProvisionalUserKeys> = []): Promise<Keystore> {
    /* eslint-disable no-underscore-dangle */

    // $FlowExpectedError we are making a read-only key store for tests, no need for a real database
    const keystore = new Keystore(null);
    keystore._safe = new KeySafe({
      deviceId: utils.toBase64(device.id),
      signaturePair: device.signKeys,
      encryptionPair: device.encryptionKeys,
      userKeys: user.userKeys ? [user.userKeys] : [],
      encryptedUserKeys: [],
      provisionalUserKeys: [],
      userSecret: new Uint8Array(32),
    });
    keystore._userKeys = {};
    if (user.userKeys)
      keystore._userKeys[utils.toBase64(user.userKeys.publicKey)] = user.userKeys;
    keystore._provisionalUserKeys = {};
    for (const ident of provisionalIdentities) {
      const id = utils.toBase64(utils.concatArrays(ident.appSignatureKeyPair.publicKey, ident.tankerSignatureKeyPair.publicKey));
      const keys = { appEncryptionKeyPair: ident.appEncryptionKeyPair, tankerEncryptionKeyPair: ident.tankerEncryptionKeyPair };
      keystore._safe.provisionalUserKeys.push({ id, ...keys });
      keystore._provisionalUserKeys[id] = keys;
    }
    return keystore;

    /* eslint-enable no-underscore-dangle */
  }
}

export async function makeTrustchainBuilder(skipRootBlock?: bool): Promise<TrustchainBuilder> {
  const builder = new TrustchainBuilder();
  await builder.init(skipRootBlock);

  return builder;
}
