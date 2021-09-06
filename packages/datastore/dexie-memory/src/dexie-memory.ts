import type { IDexie } from '@tanker/datastore-dexie-base'
import { errors } from '@tanker/datastore-base';

import { Collection } from './collection';
import { Table } from './table';
import { WhereClause } from './where-clause';

// This cache allows to close and reopen the same database (i.e.
// having the same name) while in the same JavaScript context
const inMemoryDatabaseCache: Record<string, DexieMemory> = {};
const inMemoryDatabaseVersion: Record<string, number> = {};

// An adapter exposing a Dexie-like API but holding
// the data in memory (in a javascript Array).
export class DexieMemory implements IDexie {
  declare dbName: string;
  declare _open: boolean;
  declare _tables: Record<string, Table>;
  declare _version: number;
  static dataStoreName = 'DexieMemory';

  constructor(dbName: string, options: Record<string, any>) {
    if (options['autoOpen']) {
      throw new errors.DataStoreError('InvalidArgument', null, 'unsupported option: autoOpen');
    }

    if (dbName in inMemoryDatabaseCache) {
      return inMemoryDatabaseCache[dbName]!;
    }

    this.dbName = dbName;
    this._tables = {};
    inMemoryDatabaseCache[dbName] = this;
  }

  version = (version: number) => {
    this._version = version;
    return {
      stores: (schema: Record<string, string | null>) => {
        for (const name of Object.keys(schema)) {
          const definition = schema[name]!;

          if (name in this._tables) {
            if (definition === null) {
              delete this._tables[name];
            } else {
              this._tables[name]!.setDefinition(definition);
            }
          } else {
            this._tables[name] = new Table(name, definition);
          }
        }
      },
    };
  };

  table = (name: string) => {
    if (!this._open)
      throw new Error('[dexie-memory] trying to use a table on a closed database');

    const table = this._tables[name];
    if (!table)
      throw new Error('[dexie-memory] trying to use a table not defined by the schema');

    return table;
  };

  open = async () => {
    const memoryVersion = inMemoryDatabaseVersion[this.dbName];

    if (memoryVersion && memoryVersion > this._version) {
      throw new errors.VersionError(new Error(`[dexie-memory] schema version mismatch: required version ${this._version} too low, storage version is already ${memoryVersion}`));
    }

    inMemoryDatabaseVersion[this.dbName] = this._version;
    this._open = true;

    return this;
  };

  close = () => { this._open = false; };

  delete = async () => {
    this._tables = {};
    delete inMemoryDatabaseCache[this.dbName];
    delete inMemoryDatabaseVersion[this.dbName];
  };

  Collection = Collection;
  Table = Table;
  WhereClause = WhereClause;
}
