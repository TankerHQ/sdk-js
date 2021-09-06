import type { IWhereClause, ICollection } from '@tanker/datastore-dexie-base';

export class WhereClause implements IWhereClause {
  declare _collection: ICollection;
  declare _key: string;

  constructor(collection: ICollection, key: string | string[]) {
    this._collection = collection;
    if (typeof (key) === 'object') {
      throw new Error('not implemented: WhereClause only handles "string"');
    }
    this._key = key;
  }

  above = (value: any): ICollection => this._collection.and((record: Record<string, any>) => record[this._key] > value);
  aboveOrEqual = (value: any): ICollection => this._collection.and((record: Record<string, any>) => record[this._key] >= value);
  anyOf = (values: Array<any>): ICollection => this._collection.and((record: Record<string, any>) => values.includes(record[this._key]));
  below = (value: any): ICollection => this._collection.and((record: Record<string, any>) => record[this._key] < value);
  belowOrEqual = (value: any): ICollection => this._collection.and((record: Record<string, any>) => record[this._key] <= value);
  equals = (value: any): ICollection => this._collection.and((record: Record<string, any>) => record[this._key] === value);
  notEqual = (value: any): ICollection => this._collection.and((record: Record<string, any>) => record[this._key] !== value);
}
