import type { b64string } from '@tanker/crypto';
import type { DataStore, DataStoreAdapter, Schema } from '@tanker/datastore-base';
import { errors as dbErrors, mergeSchemas } from '@tanker/datastore-base';
import { UpgradeRequired } from '@tanker/errors';

import OidcStore from '../OidcNonce/OidcStore';

import { globalSchema, TABLE_METADATA } from './schema';

const STORAGE_VERSION_KEY = 'storageVersion';
const CURRENT_STORAGE_VERSION = 1;

export type DataStoreOptions = {
  adapter: () => DataStoreAdapter;
  prefix?: string;
  dbPath?: string;
  url?: string;
};

export class UnauthSessionStorage {
  _options: DataStoreOptions;
  _datastore!: DataStore;
  _oidcStore!: OidcStore;
  _schemas!: Array<Schema>;

  constructor(options: DataStoreOptions) {
    this._options = options;
  }

  get oidcStore(): OidcStore {
    return this._oidcStore;
  }

  async open(appId: b64string): Promise<void> {
    const { adapter, prefix, dbPath, url } = this._options;

    const schemas = mergeSchemas(
      globalSchema,
      OidcStore.schemas,
    );
    const dbName = `tanker_${prefix ? `${prefix}_` : ''}${appId}`;

    try {
      // @ts-expect-error forward `dbPath` for pouchdb Adapters
      this._datastore = await adapter().open({ dbName, dbPath, schemas, url });
    } catch (e) {
      if (e instanceof dbErrors.VersionError) {
        throw new UpgradeRequired(e);
      }
      throw e;
    }

    this._schemas = schemas;

    this._oidcStore = await OidcStore.open(this._datastore);

    await this._checkVersion();
  }

  async close() {
    await this._closeSubStores();
    await this._datastore.close();
  }

  async _closeSubStores() {
    await this._oidcStore.close();
  }

  async _checkVersion(): Promise<void> {
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
      await this.cleanupCaches();
      await this._datastore.put(TABLE_METADATA, { _id: STORAGE_VERSION_KEY, storageVersion: CURRENT_STORAGE_VERSION });
    }
  }

  async cleanupCaches() {
    const currentSchema = this._schemas[this._schemas.length - 1]!;
    const cacheTables = currentSchema.tables.filter(t => !t.persistent && !t.deleted).map(t => t.name);
    for (const table of cacheTables) {
      await this._datastore.clear(table);
    }
  }
}

export default UnauthSessionStorage;
