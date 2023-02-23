import type { DataStore, SortParams, Schema, BaseConfig } from '@tanker/datastore-base';
import { errors as dbErrors, transform } from '@tanker/datastore-base';

const { deserializeBinary: fromDB, serializeBinary: toDB } = transform;

export type Config = BaseConfig;

export type { Schema };

function extractSortKey(sort: SortParams): string {
  const [sortParam] = sort;

  if (typeof sortParam === 'string')
    return sortParam;

  const [sortKey] = Object.keys(sortParam as Record<string, any>);
  return sortKey!;
}

/* eslint-disable no-underscore-dangle */

export default ((PouchDB: any, prefix?: string) => class PouchDBStoreBase implements DataStore {
  declare _dbs: Record<string, typeof PouchDB>;
  declare _version: number;

  constructor(dbs: Record<string, typeof PouchDB>) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_dbs', { value: dbs, writable: true });
    Object.defineProperty(this, '_version', { value: 0, writable: true });
    return this;
  }

  get className(): string {
    return this.constructor.name;
  }

  parallelEachDb<R>(fun: (arg0: typeof PouchDB) => Promise<R>): Promise<Array<R>> {
    const promises = Object.keys(this._dbs!).map(k => fun(this._dbs[k]!));
    return Promise.all(promises);
  }

  async close(): Promise<void> {
    if (!this._dbs)
      return;

    try {
      await this.parallelEachDb((db: PouchDBStoreBase) => db.close());
      // @ts-expect-error
      this._dbs = null;
      // @ts-expect-error
      this._version = null;
    } catch (error) {
      console.error(`Error when closing ${this.className}: `, error);
    }
  }

  /// WARNING: This WILL destroy ALL YOUR DATA! No refunds.
  async destroy(): Promise<void> {
    if (!this._dbs)
      return;

    await this.parallelEachDb(db => db.destroy());
    // @ts-expect-error
    this._dbs = null;
    // @ts-expect-error
    this._version = null;
  }

  async clear(table: string): Promise<void> {
    // naive RAM-consuming implementation
    const records = await this.getAll(table);
    records.forEach(record => { record['_deleted'] = true; }); // eslint-disable-line

    await this._dbs[table].bulkDocs(records);
  }

  static async open(config: BaseConfig): Promise<PouchDBStoreBase> {
    if (!config) {
      throw new Error('Invalid empty config');
    }

    const { dbName, schemas } = config;

    if (!dbName) {
      throw new Error('Invalid empty dbName in config');
    }

    if (!schemas) {
      throw new Error('The PouchDB adapter requires schemas in open()\'s config');
    }

    const openingDatabases: Record<string, Promise<void>> = {};
    const openedDatabases: Record<string, typeof PouchDB> = {};

    // In PouchDB, each table requires its own database. We'll start creating
    // databases starting from the latest schema and going back in time to
    // delete flagged tables.
    const reversedSchemas = [...schemas].reverse();

    for (const schema of reversedSchemas) {
      for (const table of schema.tables) {
        const { name, deleted } = table;

        // Open db only if not already opening
        if (!(name in openingDatabases)) {
          openingDatabases[name] = (async () => {
            const db = await this._openDatabase({
              dbName,
              tableName: name,
            });

            // Immediately destroy deleted databases
            if (deleted) {
              await db.destroy();
            } else {
              openedDatabases[name] = db;
            }
          })();
        }
      }
    }

    // Waiting for parallel opening to finish
    await Promise.all(Object.values(openingDatabases));

    const store = new PouchDBStoreBase(openedDatabases);
    await store.defineSchemas(schemas);

    return store;
  }

  static async _openDatabase(config: { dbName: string, tableName: string }): Promise<typeof PouchDB> {
    const { dbName, tableName } = config;
    const name = `${dbName}_${tableName}`;

    // wait for the db to be ready before returning the store
    return new Promise((resolve, reject) => {
      // but timeout after 30s if db not ready yet
      // declare error outside the setTimeout for a better callstack
      const error = new Error(`Could not open PouchDB for: ${name}`);
      const timeout = setTimeout(() => reject(error), 30000);

      try {
        const db = new PouchDB(prefix ? prefix + name : name);

        db.addListener('created', () => resolve(db));

        // resolve if already created
        if (db.taskqueue.isReady) {
          resolve(db);
        }
      } catch (e) {
        reject(e);
      }

      clearTimeout(timeout);
    });
  }

  version(): number {
    return this._version;
  }

  async defineSchemas(schemas: Array<Schema>): Promise<void> {
    // Create indexes from the latest schema only
    const schema = schemas[schemas.length - 1]!;
    this._version = schema.version;

    const { tables } = schema;

    for (const table of tables) {
      const { name, indexes, deleted } = table;

      // Skip deleted tables
      if (!deleted && indexes) {
        for (const index of indexes) {
          await this._dbs[name].createIndex({ index: { fields: index } });
        }
      }
    }
  }

  add = async (table: string, record: Record<string, any>) => {
    try {
      const recordWithoutRev = { ...record };
      delete recordWithoutRev['_rev'];
      const result = await this._dbs[table].put(toDB(recordWithoutRev));
      return { ...recordWithoutRev, _rev: result.rev };
    } catch (err) {
      const e = err as Error & { status: number };
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }

      throw new dbErrors.UnknownError(e);
    }
  };

  put = async (table: string, record: Record<string, any>) => {
    const rec = { ...record };
    try {
      if (typeof rec['_rev'] !== 'string') {
        try {
          const result = await this.get(table, rec['_id']);
          rec['_rev'] = result._rev;
        } catch (e) {
          if (!(e instanceof dbErrors.RecordNotFound)) {
            throw e;
          }
        }
      }

      await this._dbs[table].put(toDB(rec));
    } catch (err) {
      const e = err as Error & { status: number };
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }

      throw new dbErrors.UnknownError(e);
    }
  };

  // Warning: will only update the records that contain _id
  //          since it is required for bulkDocs to operate.
  //          see: https://pouchdb.com/api.html#batch_create
  bulkAdd = async (table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>) => {
    const all = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      const allWithoutRevs = all.map(record => {
        const recordWithoutRev = { ...record };
        delete recordWithoutRev['_rev'];
        return recordWithoutRev;
      });
      await this._dbs[table].bulkDocs(toDB(allWithoutRevs));
    } catch (err) {
      const e = err as Error & { status: number };
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }

      throw new dbErrors.UnknownError(e);
    }
  };

  // Warning: will only update the records that contain both _id and _rev keys,
  //          since they are both required for bulkDocs to operate.
  //          see: https://pouchdb.com/api.html#batch_create
  bulkPut = async (table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>) => {
    let all = (records instanceof Array) ? records : [records, ...otherRecords];

    try {
      // find records with missing _rev
      const ids = all.filter(rec => typeof rec['_rev'] !== 'string').map(rec => rec['_id']);

      if (ids.length > 0) {
        const idToRev: Record<string, any> = {};
        const previousRecords: Array<Record<string, any>> = await this.find(table, { selector: { _id: { $in: ids } } });
        previousRecords.forEach(rec => {
          idToRev[rec['_id']] = rec['_rev'];
        });
        // add missing _rev
        all = all.map(rec => {
          const rev = idToRev[rec['_id']];
          return rev ? { ...rec, _rev: rev } : rec;
        });
      }

      await this._dbs[table].bulkDocs(toDB(all));
    } catch (err) {
      const e = err as Error & { status: number };
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }

      throw new dbErrors.UnknownError(e);
    }
  };

  bulkDelete = async (table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>) => {
    const allRecords = (records instanceof Array) ? records : [records, ...otherRecords];
    const idsToDelete = allRecords.map(r => r['_id']);
    // This round trip is required to ensure the _rev key is present in records
    // so that the bulkDocs() call in bulkPut will properly update the records.
    const recordsToDelete: Array<Record<string, any>> = await this.find(table, { selector: { _id: { $in: idsToDelete } } });
    return this.bulkPut(table, recordsToDelete.map(r => ({ ...r, _deleted: true })));
  };

  get = async (table: string, id: string) => {
    try {
      return fromDB(await this._dbs[table].get(id));
    } catch (err) {
      const e = err as Error & { status: number };
      if (e.status === 404) {
        throw new dbErrors.RecordNotFound(e);
      } else {
        throw new dbErrors.UnknownError(e);
      }
    }
  };

  getAll = async (table: string) => {
    const result: PouchDB.Core.AllDocsResponse<any> = await this._dbs[table].allDocs({ include_docs: true });
    const records: Array<Record<string, any>> = [];
    result.rows.forEach(row => {
      const { doc } = row;

      // skip _design records stored alongside the data!
      if (doc._id.substr(0, 7) !== '_design') {
        records.push(fromDB(doc));
      }
    });
    return records;
  };

  find = async (table: string, query: { selector?: Record<string, any>; sort?: SortParams; limit?: number; } = {}) => {
    const { selector: optSelector, sort } = query;
    const selector = optSelector || { _id: { $exists: true } };

    // PouchDB cannot sort if the field is not present in the selector too
    if (sort) {
      const sortKey = extractSortKey(sort);

      if (!selector[sortKey]) {
        selector[sortKey] = { $gte: null }; // dumb selector to get all
      }
    }

    const { docs } = await this._dbs[table].find({ ...query, selector });
    const records = fromDB(docs);
    return records;
  };

  first = async (table: string, query: { selector?: Record<string, any>; sort?: SortParams; } = {}) => {
    const results = await this.find(table, { ...query, limit: 1 });
    return results[0];
  };

  delete = async (table: string, id: string) => {
    try {
      const recordToDelete = await this.get(table, id);
      await this.put(table, { ...recordToDelete, _deleted: true });
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotFound)) {
        throw e;
      }
    }
  };
});
