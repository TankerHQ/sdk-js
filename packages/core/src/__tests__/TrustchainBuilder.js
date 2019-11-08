// @flow
import { tcrypto, utils } from '@tanker/crypto';
import { type DataStore, mergeSchemas } from '@tanker/datastore-base';
import { createIdentity } from '@tanker/identity';

import { extractUserData } from '../Session/UserData';

import dataStoreConfig, { makePrefix } from './TestDataStore';
import Generator, {
  type GeneratorUserResult,
} from './Generator';
import TrustchainStore from '../Trustchain/TrustchainStore';
import TrustchainVerifier from '../Trustchain/TrustchainVerifier';
import Trustchain from '../Trustchain/Trustchain';

import Storage from '../Session/Storage';
import KeyStore from '../Session/KeyStore';
import UserStore from '../Users/UserStore';
import GroupStore from '../Groups/GroupStore';
import UnverifiedStore from '../Trustchain/UnverifiedStore/UnverifiedStore';

import { deviceCreationFromBlock } from '../Users/Serialize';

export default class TrustchainBuilder {
  dataStore: DataStore<*>;
  generator: Generator;
  trustchainStore: TrustchainStore;
  trustchainVerifier: TrustchainVerifier;
  trustchain: Trustchain;
  keyStore: KeyStore;
  userStore: UserStore;
  groupStore: GroupStore;
  unverifiedStore: UnverifiedStore;
  dataStoreConfig: Object;
  trustchainKeyPair: Object;

  async init(skipRootBlock?: bool) {
    const schemas = mergeSchemas(
      KeyStore.schemas,
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

    this.trustchainVerifier = new TrustchainVerifier(trustchainId, storage);
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
}

export async function makeTrustchainBuilder(skipRootBlock?: bool): Promise<TrustchainBuilder> {
  const builder = new TrustchainBuilder();
  await builder.init(skipRootBlock);

  return builder;
}
