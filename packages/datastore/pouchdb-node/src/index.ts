import path from 'path';
import fs from 'fs';
import PouchDB from 'pouchdb-core';
import PouchDBAdapterLevel from 'pouchdb-adapter-leveldb';
import PouchDBFind from 'pouchdb-find';
import type { Config as BaseConfig } from '@tanker/datastore-pouchdb-base';
import PouchDBStoreBase from '@tanker/datastore-pouchdb-base';

export type Config = BaseConfig & { dbPath: string; };
let _initialized = false; // eslint-disable-line no-underscore-dangle

const normalizePath = (dbPath: string) => {
  let normalized = path.normalize(dbPath);

  if (normalized.charAt(normalized.length - 1) !== path.sep) {
    normalized += path.sep;
  }

  if (!fs.existsSync(normalized) || !fs.lstatSync(normalized).isDirectory()) {
    throw new Error(`dbPath does not point to a directory: ${normalized}`);
  }

  return normalized;
};

const PouchDBNodeBackend = () => {
  if (!_initialized) {
    PouchDB.plugin(PouchDBAdapterLevel);
    PouchDB.plugin(PouchDBFind);
    PouchDB.dataStoreName = 'PouchDBNode';
    _initialized = true;
  }

  // Auto-compaction will avoid retaining old versions of updated records
  return PouchDB.defaults({ adapter: 'leveldb', auto_compaction: true });
};

export default (() => {
  const PouchDBStore = PouchDBStoreBase(PouchDBNodeBackend());

  return class PouchDBNodeStore extends PouchDBStore {
    // $FlowIgnore: open takes a Config argument but parent method takes a BaseConfig
    static async open(config: Config): Promise<PouchDBStoreBase> {
      const { dbPath, dbName, ...otherConfig } = config;
      const normalizedPath = normalizePath(dbPath);
      const normalizedDbName = `${normalizedPath}${dbName}`;
      return PouchDBStore.open({ ...otherConfig, dbName: normalizedDbName });
    }
  };
});
