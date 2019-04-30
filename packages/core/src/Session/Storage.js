// @flow

import { utils } from '@tanker/crypto';
import { errors as dbErrors, mergeSchemas, type DataStore } from '@tanker/datastore-base';

import KeyStore from './Keystore';
import ResourceStore from '../Resource/ResourceStore';
import UserStore from '../Users/UserStore';
import GroupStore from '../Groups/GroupStore';
import TrustchainStore, { TABLE_METADATA } from '../Trustchain/TrustchainStore';
import UnverifiedStore from '../UnverifiedStore/UnverifiedStore';

const STORAGE_VERSION_KEY = 'storageVersion';
const CURRENT_STORAGE_VERSION = 1;

export type DataStoreOptions = $Exact<{
  adapter: () => Class<DataStore<any>>,
  prefix?: string,
  dbPath?: string,
  url?: string
}>;

export default class Storage {
  _options: DataStoreOptions;
  _datastore: DataStore<*>;
  _keyStore: KeyStore;
  _resourceStore: ResourceStore;
  _userStore: UserStore;
  _groupStore: GroupStore;
  _unverifiedStore: UnverifiedStore;
  _trustchainStore: TrustchainStore;
  _schemas: any;

  constructor(options: DataStoreOptions) {
    this._options = options;
  }

  get keyStore(): KeyStore {
    return this._keyStore;
  }

  get resourceStore(): ResourceStore {
    return this._resourceStore;
  }

  get userStore(): UserStore {
    return this._userStore;
  }

  get groupStore(): GroupStore {
    return this._groupStore;
  }

  get unverifiedStore(): UnverifiedStore {
    return this._unverifiedStore;
  }

  get trustchainStore(): TrustchainStore {
    return this._trustchainStore;
  }

  async open(userId: Uint8Array, userSecret: Uint8Array): Promise<void> {
    const { adapter, prefix, dbPath, url } = this._options;

    const schemas = mergeSchemas(
      KeyStore.schemas,
      ResourceStore.schemas,
      TrustchainStore.schemas,
      UserStore.schemas,
      GroupStore.schemas,
      UnverifiedStore.schemas,
    );

    const dbName = `tanker_${prefix ? `${prefix}_` : ''}${utils.toSafeBase64(userId)}`;
    // $FlowIKnow DataStore is a flow interface, which does not support static methods
    this._datastore = await adapter().open({ dbName, dbPath, schemas, url });
    this._schemas = schemas;

    this._keyStore = await KeyStore.open(this._datastore, userSecret);
    this._resourceStore = await ResourceStore.open(this._datastore, userSecret);
    this._userStore = new UserStore(this._datastore, userId);
    this._groupStore = await GroupStore.open(this._datastore, userSecret);
    this._trustchainStore = await TrustchainStore.open(this._datastore);
    this._unverifiedStore = await UnverifiedStore.open(this._datastore);

    await this._checkVersion();
  }

  async close() {
    await this._closeSubStores();
    await this._datastore.close();
  }

  // WARNING: This WILL destroy ALL YOUR DATA! No refunds.
  async nuke() {
    await this._closeSubStores();
    await this._datastore.destroy();
    await this._datastore.close();
  }

  async _closeSubStores() {
    await this._unverifiedStore.close();
    await this._groupStore.close();
    await this._resourceStore.close();
    await this._keyStore.close();
  }

  async _checkVersion(): Promise<void> {
    let currentVersion;
    try {
      const record = await this._datastore.get(TABLE_METADATA, STORAGE_VERSION_KEY);
      currentVersion = record.storageVersion;
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotFound)) {
        throw e;
      }
    }
    if (!currentVersion || currentVersion < CURRENT_STORAGE_VERSION) {
      await this.cleanupCaches();
      await this._datastore.put(TABLE_METADATA, { _id: STORAGE_VERSION_KEY, storageVersion: CURRENT_STORAGE_VERSION });
    }
  }

  async cleanupCaches() {
    const currentSchema = this._schemas[this._schemas.length - 1];
    const cacheTables = currentSchema.tables.filter(t => !t.persistent).map(t => t.name);
    for (const table of cacheTables) {
      await this._datastore.clear(table);
    }
    await this._keyStore.clearCache();
    await this._trustchainStore.initData();
  }

  hasLocalDevice() {
    return !!this._keyStore.deviceId;
  }
}
