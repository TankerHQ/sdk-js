import { utils } from '@tanker/crypto';
import type { BaseConfig, DataStore, DataStoreAdapter, Schema } from '@tanker/datastore-base';
import { errors as dbErrors, mergeSchemas } from '@tanker/datastore-base';
import { UpgradeRequired } from '@tanker/errors';

import { KeyStore } from '../LocalUser/KeyStore';
import { ResourceStore } from '../Resources/ResourceStore';
import { GroupStore } from '../Groups/GroupStore';
import { globalSchema, TABLE_METADATA } from './schema';
import { TransparentSessionStore } from '../TransparentSession/SessionStore';

const STORAGE_VERSION_KEY = 'storageVersion';
const CURRENT_STORAGE_VERSION = 1;

export type DataStoreOptions = {
  adapter: () => DataStoreAdapter;
  prefix?: string;
  dbPath?: string;
  url?: string;
};

export class Storage {
  _options: DataStoreOptions;
  _datastore!: DataStore;
  _keyStore!: KeyStore;
  _resourceStore!: ResourceStore;
  _groupStore!: GroupStore;
  _sessionStore!: TransparentSessionStore;

  static defaultVersion = 14;
  private static _schemas: Schema[];

  static schemas = () => {
    if (this._schemas) return this._schemas;

    return this._schemas = mergeSchemas(
      globalSchema,
      KeyStore.schemas,
      ResourceStore.schemas,
      GroupStore.schemas,
      TransparentSessionStore.schemas,
    );
  };

  constructor(options: DataStoreOptions) {
    this._options = options;
  }

  get keyStore(): KeyStore {
    return this._keyStore;
  }

  get resourceStore(): ResourceStore {
    return this._resourceStore;
  }

  get groupStore(): GroupStore {
    return this._groupStore;
  }

  get sessionStore(): TransparentSessionStore {
    return this._sessionStore;
  }

  async open(userId: Uint8Array, userSecret: Uint8Array): Promise<void> {
    const { adapter, prefix, dbPath, url } = this._options;

    const schemas = Storage.schemas();
    const defaultVersion = Storage.defaultVersion;
    const dbName = `tanker_${prefix ? `${prefix}_` : ''}${utils.toSafeBase64(userId)}`;

    try {
      // forward `dbPath` for pouchdb Adapters
      this._datastore = await adapter().open({ dbName, dbPath, schemas, defaultVersion, url } as BaseConfig);
    } catch (e) {
      if (e instanceof dbErrors.VersionError) {
        throw new UpgradeRequired(e);
      }
      throw e;
    }

    this._keyStore = await KeyStore.open(this._datastore, userSecret);
    this._resourceStore = await ResourceStore.open(this._datastore, userSecret);
    this._groupStore = await GroupStore.open(this._datastore, userSecret);
    this._sessionStore = await TransparentSessionStore.open(this._datastore, userSecret);

    await this._checkVersion(userSecret);
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
    await this._sessionStore.close();
    await this._groupStore.close();
    await this._resourceStore.close();
    await this._keyStore.close();
  }

  async _checkVersion(userSecret: Uint8Array): Promise<void> {
    let currentVersion;
    try {
      const record = await this._datastore.get(TABLE_METADATA, STORAGE_VERSION_KEY);
      currentVersion = record['storageVersion'];
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotFound)) {
        throw e;
      }
    }
    if (!currentVersion || currentVersion < CURRENT_STORAGE_VERSION) {
      await this.cleanupCaches(userSecret);
      await this._datastore.put(TABLE_METADATA, { _id: STORAGE_VERSION_KEY, storageVersion: CURRENT_STORAGE_VERSION });
    }
  }

  async cleanupCaches(userSecret: Uint8Array) {
    await this._keyStore.clearCache(userSecret);

    const schemaVersion = this._datastore.version();
    const currentSchema = Storage.schemas().find((schema) => schema.version === schemaVersion);
    if (!currentSchema) {
      return;
    }

    const cacheTables = currentSchema.tables.filter(t => !t.persistent && !t.deleted).map(t => t.name);
    for (const table of cacheTables) {
      await this._datastore.clear(table);
    }
  }
}
