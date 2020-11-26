// @flow
import { Collection } from './collection';
import { Table } from './table';
import { WhereClause } from './where-clause';

// This cache allows to close and reopen the same database (i.e.
// having the same name) while in the same JavaScript context
const InMemoryDatabaseCache = {};

// An adapter exposing a Dexie-like API but holding
// the data in memory (in a javascript Array).
//
// Implements a subset of the Dexie interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/dexie.d.ts
export class DexieMemory {
  declare dbName: string;
  declare _closed: bool;
  declare _tables: { [name: string]: Table };

  static dataStoreName = 'DexieMemory';

  constructor(dbName: string/*, options: Object */) {
    if (dbName in InMemoryDatabaseCache) {
      InMemoryDatabaseCache[dbName]._closed = false; // eslint-disable-line no-underscore-dangle
      return InMemoryDatabaseCache[dbName];
    }

    this.dbName = dbName;
    this._closed = false; // we always assume { autoOpen: true }
    this._tables = {};
    InMemoryDatabaseCache[dbName] = this;
  }

  version = (/* version: number */): any => ({
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
  });

  table = (name: string): Table => {
    if (this._closed)
      throw new Error('[dexie-memory] trying to use a table on a closed database');

    return this._tables[name];
  }

  close = () => { this._closed = true; };

  delete = async () => {
    this._tables = {};
    delete InMemoryDatabaseCache[this.dbName];
  }

  Collection = Collection;
  Table = Table;
  WhereClause = WhereClause;
}
