// @flow
import { errors as dbErrors, transform, type DataStore, type SortParams, type Schema, type BaseConfig } from '@tanker/datastore-base';

export type Config = BaseConfig;
export type { Schema };

class UnsupportedTypeError extends Error {
  name: string;

  constructor(type: string) {
    super(`Dexie can't support search for ${type} values on an index, as they are invalid IndexedDB keys.`);
    this.name = this.constructor.name;
  }
}

const iframe = (typeof window !== 'undefined') && window.parent && window.parent !== window;
const fromDB = iframe ? transform.fixObjects : transform.identity;

export default (Dexie: any) => class DexieBrowserStore implements DataStore<Dexie> {
  /*:: _db: Dexie; */
  /*:: _indexes: { [table: string]: { [field: string]: bool } }; */

  constructor(db: Dexie) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_db', { value: db, writable: true });
    Object.defineProperty(this, '_indexes', { value: {}, writable: true });
    return this;
  }

  get className(): string {
    return this.constructor.name;
  }

  // Note: this does NOT support multi-column indexes (yet)
  isIndexed(table: string, field: string): bool {
    return field === '_id' || !!(this._indexes[table] && this._indexes[table][field]);
  }

  async close(): Promise<void> {
    if (!this._db)
      return;

    try {
      this._db.close(); // completes immediately, no promise
      this._db = null;
      // $FlowIgnore
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
    this._db = null;
    // $FlowIgnore
    this._indexes = null;
  }

  async clear(table: string): Promise<void> {
    await this._db.table(table).clear();
  }

  static async open(config: Config): Promise<DexieBrowserStore> {
    if (!config || !config.dbName) {
      throw new Error('Invalid empty dbName in config');
    }

    const dbOptions = { autoOpen: true }; // already default

    const db = new Dexie(config.dbName, dbOptions);

    const store = new DexieBrowserStore(db);

    // $FlowIgnore
    await store.defineSchemas(config.schemas);

    return store;
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

      const definitions = {};

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
              this._indexes[name][i[0]] = true; // remember indexed fields
              definition.push(i.length === 1 ? i[0] : `[${i.join('+')}]`);
            }
          }

          definitions[name] = definition.join(',');
        }
      }

      this._db.version(version).stores(definitions);
    }

    const tableMap = {};
    for (const schema of schemas) {
      for (const table of schema.tables) {
        tableMap[table.name] = true;
      }
    }
  }

  add = async (table: string, record: Object) => {
    try {
      await this._db.table(table).add(record);
    } catch (e) {
      if (e.name === 'ConstraintError') {
        throw new dbErrors.RecordNotUnique(e);
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  put = async (table: string, record: Object) => {
    try {
      await this._db.table(table).put(record);
    } catch (e) {
      if (e.name === 'ConstraintError') {
        throw new dbErrors.RecordNotUnique(e);
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  bulkAdd = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const allRecords = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      await this._db.table(table).bulkAdd(allRecords);
    } catch (e) {
      if (e.name === 'BulkError') {
        if (e.failures.every(err => err.name === 'ConstraintError')) {
          return; // ignore duplicate adds
        }
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  bulkPut = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const allRecords = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      await this._db.table(table).bulkPut(allRecords);
    } catch (e) {
      if (e.name === 'ConstraintError') {
        throw new dbErrors.RecordNotUnique(e);
      }
      throw new dbErrors.UnknownError(e);
    }
  }

  bulkDelete = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const allRecords = (records instanceof Array) ? records : [records, ...otherRecords];
    try {
      await this._db.table(table).bulkDelete(allRecords.map(r => r._id)); // eslint-disable-line no-underscore-dangle
    } catch (e) {
      throw new dbErrors.UnknownError(e);
    }
  }

  get = async (table: string, id: string) => {
    let record;
    try {
      record = fromDB(await this._db.table(table).get(id));
    } catch (e) {
      throw new dbErrors.UnknownError(e);
    }

    // undefined is return when record not found
    if (!record) {
      throw new dbErrors.RecordNotFound();
    }

    return record;
  }

  getAll = async (table: string) => {
    const records = await this._db.table(table).toArray();
    return fromDB(records);
  }

  find = async (table: string, query?: { selector?: Object, sort?: SortParams, limit?: number } = {}) => {
    const { selector, sort, limit } = query;
    let q = this._db.table(table);
    let index = null;

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

      if (index) {
        q = this._chainWhere(q, index, selector[index]);
      } else {
        // console.warn('Querying with no indexed field in the selector: ', JSON.stringify(selector)); // eslint-disable-line no-console
        throw new Error('A selector must provide at least one indexed field');
      }

      if (fields.length > 0) {
        const andValues = { ...selector };
        delete andValues[index];
        q = this._chainAnd(q, andValues);
      }
    }

    if (sort) {
      q = this._chainSort(q, sort, index, table);
    }

    if (limit) {
      q = this._chainLimit(q, limit);
    }

    // At this point:
    //   - either sortBy() has been called and q is already a Promise<Array<Object>>,
    //   - or q is a Dexie Collection or Table to convert to a Promise<Array<Object>>
    if (q instanceof this._db.Collection || q instanceof this._db.Table) {
      q = q.toArray();
    }

    return fromDB(await q);
  }

  first = async (table: string, query?: { selector?: Object, sort?: SortParams } = {}) => {
    const results = await this.find(table, { ...query, limit: 1 });
    return results[0];
  }

  delete = async (table: string, id: string) => {
    try {
      await this._db.table(table).delete(id);
    } catch (e) {
      throw new dbErrors.UnknownError(e);
    }
  }

  _chainWhere<Q>(query: Q, key: string, value: string | number | Object): Q {
    let q: any = query;

    q = q.where(key); // WhereClause (Dexie)

    // object
    if (value instanceof Object) {
      if ('$in' in value) {
        q = q.anyOf(value['$in']); // eslint-disable-line dot-notation
      } else if ('$gt' in value) {
        q = q.above(value['$gt']); // eslint-disable-line dot-notation
      } else if ('$gte' in value) {
        q = q.aboveOrEqual(value['$gte']); // eslint-disable-line dot-notation
      } else if ('$lt' in value) {
        q = q.below(value['$lt']); // eslint-disable-line dot-notation
      } else if ('$lte' in value) {
        q = q.belowOrEqual(value['$lte']); // eslint-disable-line dot-notation
      } else if ('$eq' in value) {
        q = q.equals(value['$eq']); // eslint-disable-line dot-notation
      } else if ('$ne' in value) {
        q = q.notEqual(value['$ne']); // eslint-disable-line dot-notation
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

      q = q.equals(value);
    }

    return q; // Collection (Dexie)
  }

  _chainAnd<Q>(query: Q, andValues: Object): Q {
    let q: any = query;

    const keys = Object.keys(andValues);

    q = q.and(record => {
      for (const key of keys) {
        const value = andValues[key];
        if (value instanceof Object) {
          if ('$in' in value) {
            if (!value['$in'].includes(record[key])) { // eslint-disable-line dot-notation
              return false;
            }
          } else if ('$gt' in value) {
            if (record[key] <= value['$gt']) { // eslint-disable-line dot-notation
              return false;
            }
          } else if ('$gte' in value) {
            if (record[key] < value['$gte']) { // eslint-disable-line dot-notation
              return false;
            }
          } else if ('$lt' in value) {
            if (record[key] >= value['$lt']) { // eslint-disable-line dot-notation
              return false;
            }
          } else if ('$lte' in value) {
            if (record[key] > value['$lte']) { // eslint-disable-line dot-notation
              return false;
            }
          } else if ('$eq' in value) {
            if (record[key] !== value['$eq']) { // eslint-disable-line dot-notation
              return false;
            }
          } else if ('$ne' in value) {
            if (record[key] === value['$ne']) { // eslint-disable-line dot-notation
              return false;
            }
          } else if ('$exists' in value) {
            if (value['$exists'] && !(key in record)) { // eslint-disable-line dot-notation
              return false;
            }
            if (!value['$exists'] && (key in record)) { // eslint-disable-line dot-notation
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

    return q; // Collection (Dexie)
  }

  _chainSort<Q>(query: Q, sort: SortParams, index: ?string, table: string): Q | Promise<Array<Object>> {
    let q: any = query;
    let sortKey: any = sort[0]; // assume single sort
    let dir = 'asc';

    if (sortKey instanceof Object) {
      [sortKey] = Object.keys(sortKey);
      if (sort[0][sortKey] === 'desc') {
        dir = 'desc';
      }
    }

    if (dir === 'desc') {
      q = q.reverse();
    }

    // In Dexie, orderBy() uses backend sorting and needs an index,
    // whereas sortBy() is done in memory on the result array.
    if (
      q instanceof this._db.Table && (
        index === sortKey || (!index && this.isIndexed(table, sortKey))
      )
    ) {
      q = q.orderBy(sortKey); // Collection (Dexie)
    } else {
      q = q.sortBy(sortKey); // Promise<Array<Object>>
    }

    return q;
  }

  _chainLimit<Q>(query: Q | Promise<Array<Object>>, limit: number): Q | Promise<Array<Object>> {
    let q: any = query;

    if (q instanceof this._db.Collection || q instanceof this._db.Table) {
      q = q.limit(limit);
    } else {
      q = q.then(res => res.slice(0, limit));
    }

    return q;
  }
};
