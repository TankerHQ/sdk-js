// @flow

import PouchDB from 'pouchdb-core';
import PouchDBAdapterMemory from 'pouchdb-adapter-memory';
import PouchDBFind from 'pouchdb-find';
import PouchDBStoreBase from '@tanker/datastore-pouchdb-base';

export type { Config } from '@tanker/datastore-pouchdb-base';

let _initialized = false; // eslint-disable-line no-underscore-dangle

const PouchDBMemoryBackend = () => {
  if (!_initialized) {
    PouchDB.plugin(PouchDBAdapterMemory);
    PouchDB.plugin(PouchDBFind);
    PouchDB.dataStoreName = 'PouchDBMemory';
    _initialized = true;
  }

  // Auto-compaction will avoid retaining old versions of updated records
  return PouchDB.defaults({ adapter: 'memory', auto_compaction: true });
};

export default () => PouchDBStoreBase(PouchDBMemoryBackend());
