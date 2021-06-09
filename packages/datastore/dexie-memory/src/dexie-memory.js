// @flow
import { errors } from '@tanker/datastore-base';

import { Collection } from './collection';
import { Table } from './table';
import { WhereClause } from './where-clause';

// This cache allows to close and reopen the same database (i.e.
// having the same name) while in the same JavaScript context
const InMemoryDatabaseCache = {};
const InMemoryDatabaseVersion = {};

// An adapter exposing a Dexie-like API but holding
// the data in memory (in a javascript Array).
//
// Implements a subset of the Dexie interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/dexie.d.ts
export class DexieMemory {
  declare dbName: string;
  declare _open: bool;
  declare _tables: { [name: string]: Table };
  declare _version: number;

  static dataStoreName = 'DexieMemory';

  constructor(dbName: string, options: Object) {
    if (options.autoOpen) {
      throw new errors.DataStoreError('InvalidArgument', null, 'unsupported option: autoOpen');
    }
    if (dbName in InMemoryDatabaseCache) {
      return InMemoryDatabaseCache[dbName];
    }

    this.dbName = dbName;
    this._open = false;
    this._tables = {};
    InMemoryDatabaseCache[dbName] = this;
  }

  version = (version: number): any => {
    this._version = version;
    return {
      stores: (schema: { [name: string]: string }) => {
        for (const name of Object.keys(schema)) {
          const definition = schema[name];
          if (name in this._tables) {
            if (definition === null) {
              delete this._tables[name];
            } else {
              this._tables[name].setDefinition(definition);
            }
          } else {
            this._tables[name] = new Table(name, definition);
          }
        }
      }
    };
  };

  table = (name: string): Table => {
    if (!this._open)
      throw new Error('[dexie-memory] trying to use a table on a closed database');

    return this._tables[name];
  }

  open = () => {
    const memoryVersion = InMemoryDatabaseVersion[this.dbName];
    if (memoryVersion && memoryVersion > this._version) {
      throw new errors.VersionError(new Error(`[dexie-memory] schema version mismatch: required version ${this._version} too low, storage version is already ${memoryVersion}`));
    }

    InMemoryDatabaseVersion[this.dbName] = this._version;
    this._open = true;
  };

  close = () => { this._open = false; };

  delete = async () => {
    this._tables = {};
    delete InMemoryDatabaseCache[this.dbName];
    delete InMemoryDatabaseVersion[this.dbName];
  }

  Collection = Collection;
  Table = Table;
  WhereClause = WhereClause;
}
