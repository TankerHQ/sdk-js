import type { DataStore, DataStoreAdapter, SortParams, Schema, BaseConfig } from '@tanker/datastore-base';
import { errors as dbErrors, transform } from '@tanker/datastore-base';
import type { Class } from '@tanker/types';

import type { IDexie, ITable, ICollection, IWhereClause } from './types';

export type Config = BaseConfig;
export type { Schema, IDexie, ITable, ICollection, IWhereClause };
export type { IndexableType } from './types';

class UnsupportedTypeError extends Error {
  override name: string;

  constructor(type: string) {
    super(`Dexie can't support search for ${type} values on an index, as they are invalid IndexedDB keys.`);
    Object.setPrototypeOf(this, UnsupportedTypeError.prototype);

    this.name = this.constructor.name;
  }
}

const iframe = (typeof window !== 'undefined') && window.parent && window.parent !== window;
const fromDB = iframe ? transform.fixObjects : transform.identity;

const remapError = (err: Error) => {
  // forward already wrapped error
  if (err instanceof dbErrors.DataStoreError) {
    return err;
  }

  if (err.name === 'DatabaseClosedError') {
    return new dbErrors.DataStoreClosedError(err);
  }

  if (err.name === 'ConstraintError') {
    return new dbErrors.RecordNotUnique(err);
  }

  return new dbErrors.UnknownError(err);
};

export default ((DexieClass: Class<IDexie>): DataStoreAdapter => class DexieBrowserStore implements DataStore {
  declare _db: IDexie;
  declare _indexes: Record<string, Record<string, boolean>>;

  constructor(db: IDexie) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_db', { value: db, writable: true });
    Object.defineProperty(this, '_indexes', { value: {}, writable: true });
  }

  get className(): string {
    return this.constructor.name;
  }

  // Note: this does NOT support multi-column indexes
  isIndexed(table: string, field: string): boolean {
    return field === '_id' || !!(this._indexes[table] && this._indexes[table]![field]);
  }

  async close(): Promise<void> {
    if (!this._db)
      return;

    try {
      this._db.close(); // completes immediately, no promise

      // @ts-expect-error
      this._db = null;
      // @ts-expect-error
      this._indexes = null;
    } catch (error) {
      console.error(`Error when closing ${this.className}: `, error);
    }
  }

  /// WARNING: This WILL destroy ALL YOUR DATA! No refunds.
  async destroy(): Promise<void> {
    if (!this._db)
      return;

    await this._db.delete();
    // @ts-expect-error
    this._db = null;
    // @ts-expect-error
    this._indexes = null;
  }

  async clear(table: string): Promise<void> {
    await this._db.table(table).clear();
  }

  private static async expectedVersion(db: IDexie, defaultVersion: number): Promise<number> {
    let expectedVersion = defaultVersion;

    try {
      await db.open();

      const actualVersion = db.verno;
      if (actualVersion > expectedVersion) {
        expectedVersion = actualVersion;
      }

      db.close();
    } catch (err) {
      const e = err as Error;
      if (e.name === 'NoSuchDatabaseError') {
        return defaultVersion;
      }
      throw new dbErrors.UnknownError(e);
    }

    return expectedVersion;
  }

  static async open(config: Config): Promise<DexieBrowserStore> {
    if (!config || !config.dbName) {
      throw new Error('Invalid empty dbName in config');
    }

    const { dbName, schemas, defaultVersion } = config;
    const dbOptions = { autoOpen: false };
    const db = new DexieClass(dbName, dbOptions);

    const expectedVersion = await DexieBrowserStore.expectedVersion(db, defaultVersion);
    if (!schemas.find(schema => schema.version === expectedVersion)) {
      throw new dbErrors.VersionError(new Error(`[dexie-base] schema version mismatch: required version ${defaultVersion} too low, storage version is already ${expectedVersion}`));
    }

    const store = new DexieBrowserStore(db);
    await store.defineSchemas(schemas.filter(schema => schema.version <= expectedVersion));

    try {
      await db.open();
    } catch (err) {
      const e = err as Error;
      if (e.name === 'VersionError') {
        throw new dbErrors.VersionError(e);
      }

      throw new dbErrors.UnknownError(e);
    }

    return store;
  }

  version(): number {
    return this._db.verno;
  }

  async defineSchemas(schemas: Array<Schema>): Promise<void> {
    // Example:
    //
    //   const schemas = [
    //     {
    //       version: 1,
    //       tables: [{
    //         name: 'something',
    //         indexes: [['field1'], ['field2', 'field3']]
    //       }]
    //     }
    //   ]
    //
    //   => { something: '_id,field1,[field2+field3]' }
    //
    for (const schema of schemas) {
      const { version, tables } = schema;

      const definitions: Record<string, string | null> = {};

      for (const table of tables) {
        const { name, indexes, deleted } = table;

        if (deleted) {
          definitions[name] = null; // Dexie's way to delete a collection
        } else {
          const definition = ['_id']; // non auto-incremented primaryKey

          if (indexes) {
            for (const i of indexes) {
              if (!this._indexes[name]) {
                this._indexes[name] = {};
              }

              // Note: this does not support multi-column indexes
              this._indexes[name]![i[0]!] = true; // remember indexed fields

              definition.push(i.length === 1 ? i[0]! : `[${i.join('+')}]`);
            }
          }

          definitions[name] = definition.join(',');
        }
      }

      this._db.version(version).stores(definitions);
    }
  }

  add = async (table: string, record: Record<string, any>) => {
    try {
      await this._db.table(table).add(record);
    } catch (err) {
      throw remapError(err as Error);
    }
  };

  put = async (table: string, record: Record<string, any>) => {
    try {
      await this._db.table(table).put(record);
    } catch (err) {
      throw remapError(err as Error);
    }
  };

  bulkAdd = async (table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>) => {
    const allRecords = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      await this._db.table(table).bulkAdd(allRecords);
    } catch (error) {
      const e = error as Error;
      if (e.name === 'BulkError') {
        if ((e as (Error & { failures: Array<Error> })).failures.every(err => err.name === 'ConstraintError')) {
          return; // ignore duplicate adds
        }
      }

      throw remapError(e);
    }
  };

  bulkPut = async (table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>) => {
    const allRecords = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      await this._db.table(table).bulkPut(allRecords);
    } catch (err) {
      throw remapError(err as Error);
    }
  };

  bulkDelete = async (table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>) => {
    const allRecords = records instanceof Array ? records : [records, ...otherRecords];
    try {
      await this._db.table(table).bulkDelete(allRecords.map(r => r['_id']));
    } catch (e) {
      throw remapError(e as Error);
    }
  };

  get = async (table: string, id: string) => {
    let record;

    try {
      record = fromDB(await this._db.table(table).get(id));
    } catch (e) {
      throw remapError(e as Error);
    }

    // undefined is returned when record not found
    if (!record) {
      throw new dbErrors.RecordNotFound();
    }

    return record;
  };

  getAll = async (table: string) => {
    const records = await this._db.table(table).toArray();
    return fromDB(records);
  };

  find = async (table: string, query: { selector?: Record<string, any>; sort?: SortParams; limit?: number; } = {}) => {
    const { selector, sort, limit } = query;
    const dexieTable: ITable = this._db.table(table);
    let index: string | null = null;

    let withSelector: ITable | ICollection = dexieTable;
    if (selector) {
      const keys = Object.keys(selector);
      const fields = [];

      if (keys.length < 1) {
        throw new Error('A selector must provide at least one field');
      }

      keys.forEach(k => {
        if (!index && this.isIndexed(table, k)) {
          index = k;
        } else {
          fields.push(k);
        }
      });

      if (!index) {
        // console.warn('Querying with no indexed field in the selector: ', JSON.stringify(selector)); // eslint-disable-line no-console
        throw new Error('A selector must provide at least one indexed field');
      }
      const withWhere = this._chainWhere(dexieTable, index, selector[index]);

      withSelector = withWhere;
      if (fields.length > 0) {
        const andValues = { ...selector };
        delete andValues[index];
        withSelector = this._chainAnd(withWhere, andValues);
      }
    }

    let withSort: ITable | ICollection | Promise<Array<Record<string, any>>> = withSelector;
    if (sort) {
      withSort = this._chainSort(withSelector, sort, index, table);
    }

    let withLimit: ITable | ICollection | Promise<Array<Record<string, any>>> = withSort;
    if (limit) {
      withLimit = this._chainLimit(withSort, limit);
    }

    let res: Promise<Array<Record<string, any>>>;
    // At this point:
    //   - either withLimit is a Dexie Collection or Table to convert to a Promise<Array<Object>>
    //   - or sortBy() has been called and withLimit is already a Promise<Array<Object>>,
    if (this._isTable(withLimit) || this._isCollection(withLimit)) {
      res = (withLimit as ITable | ICollection).toArray();
    } else {
      res = withLimit as typeof res;
    }

    return fromDB(await res);
  };

  first = async (table: string, query: { selector?: Record<string, any>; sort?: SortParams; } = {}) => {
    const results = await this.find(table, { ...query, limit: 1 });
    return results[0];
  };

  delete = async (table: string, id: string) => {
    try {
      await this._db.table(table).delete(id);
    } catch (e) {
      throw remapError(e as Error);
    }
  };

  _isTable(obj: any): boolean {
    // @ts-expect-error this._db.Table is a Class (has a prototype)
    return obj instanceof this._db.Table;
  }

  _isCollection(obj: any): boolean {
    // @ts-expect-error this._db.Collection is a Class (has a prototype)
    return obj instanceof this._db.Collection;
  }

  _chainWhere(table: ITable, key: string, value: string | number | Record<string, any>): ICollection {
    const where: IWhereClause = table.where(key); // WhereClause (Dexie)
    let res: ICollection;
    // object
    if (value instanceof Object) {
      if ('$in' in value) {
        res = where.anyOf(value['$in']);
      } else if ('$gt' in value) {
        res = where.above(value['$gt']);
      } else if ('$gte' in value) {
        res = where.aboveOrEqual(value['$gte']);
      } else if ('$lt' in value) {
        res = where.below(value['$lt']);
      } else if ('$lte' in value) {
        res = where.belowOrEqual(value['$lte']);
      } else if ('$eq' in value) {
        res = where.equals(value['$eq']);
      } else if ('$ne' in value) {
        res = where.notEqual(value['$ne']);
      } else {
        throw new Error(`A selector provided an unknown value: ${JSON.stringify(value)}`);
      }
    // primitive type
    } else {
      if (typeof value === 'boolean') {
        throw new UnsupportedTypeError('boolean');
      } else if (value === null) {
        throw new UnsupportedTypeError('null');
      }

      res = where.equals(value);
    }

    return res; // ICollection (Dexie)
  }

  _chainAnd(collection: ICollection, andValues: Record<string, any>): ICollection {
    const keys = Object.keys(andValues);

    return collection.and((record: Record<string, any>) => {
      for (const key of keys) {
        const value = andValues[key];

        if (value instanceof Object) {
          if ('$in' in value) {
            if (!value.$in.includes(record[key])) {
              return false;
            }
          } else if ('$gt' in value) {
            if (record[key] <= value.$gt) {
              return false;
            }
          } else if ('$gte' in value) {
            if (record[key] < value.$gte) {
              return false;
            }
          } else if ('$lt' in value) {
            if (record[key] >= value.$lt) {
              return false;
            }
          } else if ('$lte' in value) {
            if (record[key] > value.$lte) {
              return false;
            }
          } else if ('$eq' in value) {
            if (record[key] !== value.$eq) {
              return false;
            }
          } else if ('$ne' in value) {
            if (record[key] === value.$ne) {
              return false;
            }
          } else if ('$exists' in value) {
            if (value.$exists && !(key in record)) {
              return false;
            }

            if (!value.$exists && key in record) {
              return false;
            }
          } else {
            throw new Error(`A selector provided an unknown value: ${JSON.stringify(value)}`);
          }
          // equality
        } else if (record[key] !== value) {
          return false;
        }
      }

      return true;
    });
  }

  _chainSort(query: ITable | ICollection, sort: SortParams, index: string | null | undefined, table: string): ICollection | Promise<Array<Record<string, any>>> {
    if (sort.length !== 1) {
      throw new Error(`Exactly one sort param should be provided: found ${sort.length}`);
    }
    const sortParam = sort[0];

    let dir = 'asc';
    let sortKey: string;
    if (sortParam instanceof Object) {
      // @ts-expect-error Object.keys() is never empty
      [sortKey] = Object.keys(sortParam);

      if (sortParam[sortKey] === 'desc') {
        dir = 'desc';
      }
    } else {
      sortKey = sortParam as string;
    }

    let q = query;
    if (dir === 'desc') {
      q = q.reverse();
    }

    let res: ICollection | Promise<Array<Record<string, any>>>;
    // In Dexie, orderBy() uses backend sorting and needs an index,
    // whereas sortBy() is done in memory on the result array.
    if (
      this._isTable(q)
      && (index === sortKey || !index && this.isIndexed(table, sortKey))
    ) {
      res = (q as ITable).orderBy(sortKey); // ICollection (Dexie)
    } else {
      res = (q as ICollection).sortBy(sortKey); // Promise<Array<Object>>
    }

    return res;
  }

  _chainLimit(query: ITable | ICollection | Promise<Array<Record<string, any>>>, limit: number): ICollection | Promise<Array<Record<string, any>>> {
    let res: ICollection | Promise<Array<Record<string, any>>>;

    if (this._isTable(query) || this._isCollection(query)) {
      res = (query as ITable | ICollection).limit(limit);
    } else {
      res = (query as Promise<Array<Record<string, any>>>).then((array) => array.slice(0, limit));
    }

    return res;
  }
});
