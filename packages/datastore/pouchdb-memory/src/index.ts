import PouchDB from 'pouchdb-core';
import PouchDBAdapterMemory from 'pouchdb-adapter-memory';
import PouchDBFind from 'pouchdb-find';
import PouchDBStoreBase from '@tanker/datastore-pouchdb-base';

export type { Config } from '@tanker/datastore-pouchdb-base';

let _initialized = false; // eslint-disable-line no-underscore-dangle, @typescript-eslint/naming-convention

const pouchDBMemoryBackend = () => {
  if (!_initialized) {
    PouchDB.plugin(PouchDBAdapterMemory);
    PouchDB.plugin(PouchDBFind);

    // @ts-expect-error willingly add the `dataStoreName` property
    PouchDB.dataStoreName = 'PouchDBMemory';
    _initialized = true;
  }

  // Auto-compaction will avoid retaining old versions of updated records
  return PouchDB.defaults({ adapter: 'memory', auto_compaction: true });
};

export default (() => PouchDBStoreBase(pouchDBMemoryBackend()));
