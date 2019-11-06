// @flow
import { errors as dbErrors, transform, type DataStore, type SortParams, type Schema, type BaseConfig } from '@tanker/datastore-base';

const { deserializeBinary: fromDB, serializeBinary: toDB } = transform;

export type Config = BaseConfig;

export type { Schema };

function extractSortKey(sort: SortParams): string {
  const [sortParam] = sort;

  if (typeof sortParam === 'string')
    return sortParam;

  const [sortKey] = Object.keys(sortParam);
  return sortKey;
}

/* eslint-disable no-underscore-dangle */

export default (PouchDB: any, prefix?: string) => class PouchDBStoreBase implements DataStore<PouchDB> {
  /*:: _dbs: { [name: string]: PouchDB }; */

  constructor(dbs: { [name: string]: PouchDB }) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_dbs', { value: dbs, writable: true });
    return this;
  }

  get className(): string {
    return this.constructor.name;
  }

  parallelEachDb<R>(fun: (PouchDB) => Promise<R>): Promise<Array<R>> {
    const promises = Object.keys(this._dbs).map(k => fun(this._dbs[k]));
    return Promise.all(promises);
  }

  async close(): Promise<void> {
    if (!this._dbs)
      return;

    try {
      await this.parallelEachDb(db => db.close());
      // $FlowIKnow
      this._dbs = null;
    } catch (error) {
      console.error(`Error when closing ${this.className}: `, error);
    }
  }

  /// WARNING: This WILL destroy ALL YOUR DATA! No refunds.
  async destroy(): Promise<void> {
    if (!this._dbs)
      return;

    await this.parallelEachDb(db => db.destroy());
    // $FlowIKnow
    this._dbs = null;
  }

  async clear(table: string): Promise<void> {
    // naive RAM-consuming implementation
    const records = await this.getAll(table);
    records.forEach(record => { record._deleted = true; }); // eslint-disable-line
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

    const openingDatabases = {};
    const openedDatabases = {};

    // In PouchDB, each table requires its own database. We'll start creating
    // databases starting from the latest schema and going back in time to
    // delete flagged tables.
    const reversedSchemas = [...schemas].reverse();

    for (const schema of reversedSchemas) {
      for (const table of schema.tables) {
        const { name } = table;

        // Open db only if not already opening
        if (!(name in openingDatabases)) {
          openingDatabases[name] = (async () => {
            openedDatabases[name] = await this._openDatabase({
              dbName,
              tableName: name,
            });
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

  static async _openDatabase(config: Object): Promise<PouchDB> {
    const { dbName, tableName } = config;
    const name = `${dbName}_${tableName}`;

    // wait for the db to be ready before returning the store
    return Promise.race([
      new Promise((resolve, reject) => {
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
      }),
      // but timeout after 30s if db not ready yet
      new Promise((_resolve, reject) => {
        // declare error outside the setTimeout for a better callstack
        const error = new Error(`Could not open PouchDB for: ${name}`);
        setTimeout(() => reject(error), 30000);
      })
    ]);
  }

  async defineSchemas(schemas: Array<Schema>): Promise<void> {
    // Create indexes from the latest schema only
    const schema = schemas[schemas.length - 1];

    const { tables } = schema;

    for (const table of tables) {
      const { name, indexes } = table;

      if (indexes) {
        for (const index of indexes) {
          await this._dbs[name].createIndex({ index: { fields: index } });
        }
      }
    }
  }

  add = async (table: string, record: Object) => {
    try {
      const recordWithoutRev = { ...record };
      delete recordWithoutRev._rev;
      const result = await this._dbs[table].put(toDB(recordWithoutRev));
      return { ...recordWithoutRev, _rev: result.rev };
    } catch (e) {
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  put = async (table: string, record: Object) => {
    const rec = { ...record };
    try {
      if (typeof rec._rev !== 'string') {
        try {
          const result = await this.get(table, rec._id);
          rec._rev = result._rev;
        } catch (e) {
          if (!(e instanceof dbErrors.RecordNotFound)) {
            throw e;
          }
        }
      }
      await this._dbs[table].put(toDB(rec));
    } catch (e) {
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  // Warning: will only update the records that contain _id
  //          since it is required for bulkDocs to operate.
  //          see: https://pouchdb.com/api.html#batch_create
  bulkAdd = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const all = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      const allWithoutRevs = all.map(record => {
        const recordWithoutRev = { ...record };
        delete recordWithoutRev._rev;
        return recordWithoutRev;
      });
      await this._dbs[table].bulkDocs(toDB(allWithoutRevs));
    } catch (e) {
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  // Warning: will only update the records that contain both _id and _rev keys,
  //          since they are both required for bulkDocs to operate.
  //          see: https://pouchdb.com/api.html#batch_create
  bulkPut = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    let all = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      // find records with missing _rev
      const ids = all.filter(rec => typeof rec._rev !== 'string').map(rec => rec._id);
      if (ids.length > 0) {
        const idToRev = {};
        const previousRecords = await this.find(table, { selector: { _id: { $in: ids } } });
        previousRecords.forEach(rec => {
          idToRev[rec._id] = rec._rev;
        });
        // add missing _rev
        all = all.map(rec => {
          const rev = idToRev[rec._id];
          return rev ? { ...rec, _rev: rev } : rec;
        });
      }
      await this._dbs[table].bulkDocs(toDB(all));
    } catch (e) {
      if (e.status === 409) {
        throw new dbErrors.RecordNotUnique(e);
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  bulkDelete = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const allRecords = (records instanceof Array) ? records : [records, ...otherRecords];
    const idsToDelete = allRecords.map(r => r._id);
    // This round trip is required to ensure the _rev key is present in records
    // so that the bulkDocs() call in bulkPut will properly update the records.
    const recordsToDelete = await this.find(table, { selector: { _id: { $in: idsToDelete } } });
    return this.bulkPut(table, recordsToDelete.map(r => ({ ...r, _deleted: true })));
  }

  get = async (table: string, id: string) => {
    try {
      return fromDB(await this._dbs[table].get(id));
    } catch (e) {
      if (e.status === 404) {
        throw new dbErrors.RecordNotFound(e);
      } else {
        throw new dbErrors.UnknownError(e);
      }
    }
  }

  getAll = async (table: string) => {
    const result = await this._dbs[table].allDocs({ include_docs: true });
    const records = [];
    result.rows.forEach(row => {
      const { doc } = row;
      // skip _design records stored alongside the data!
      if (doc._id.substr(0, 7) !== '_design') {
        records.push(fromDB(doc));
      }
    });
    return records;
  }

  find = async (table: string, query?: { selector?: Object, sort?: SortParams, limit?: number } = {}) => {
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
  }

  first = async (table: string, query?: { selector?: Object, sort?: SortParams } = {}) => {
    const results = await this.find(table, { ...query, limit: 1 });
    return results[0];
  }

  delete = async (table: string, id: string) => {
    try {
      const recordToDelete = await this.get(table, id);
      await this.put(table, { ...recordToDelete, _deleted: true });
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotFound)) {
        throw e;
      }
    }
  }
};
