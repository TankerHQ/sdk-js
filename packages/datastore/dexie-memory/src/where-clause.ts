import { Collection } from './collection'; // eslint-disable-line import/no-cycle

// Implements a subset of the Dexie WhereClause interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/where-clause.d.ts
export class WhereClause {
  declare _collection: Collection;
  declare _key: string;

  constructor(collection: Collection, key: string) {
    this._collection = collection;
    this._key = key;
  }

  above = (value: any): Collection => this._collection.and((record: Record<string, any>) => record[this._key] > value);
  aboveOrEqual = (value: any): Collection => this._collection.and((record: Record<string, any>) => record[this._key] >= value);
  anyOf = (values: Array<any>): Collection => this._collection.and((record: Record<string, any>) => values.includes(record[this._key]));
  below = (value: any): Collection => this._collection.and((record: Record<string, any>) => record[this._key] < value);
  belowOrEqual = (value: any): Collection => this._collection.and((record: Record<string, any>) => record[this._key] <= value);
  equals = (value: any): Collection => this._collection.and((record: Record<string, any>) => record[this._key] === value);
  notEqual = (value: any): Collection => this._collection.and((record: Record<string, any>) => record[this._key] !== value);
}
