// @flow
import { Table } from './table'; // eslint-disable-line import/no-cycle
import { WhereClause } from './where-clause'; // eslint-disable-line import/no-cycle
import { makeSortFunction } from './utils';

type Filter = (record: Object) => bool;

// Implements a subset of the Dexie Collection interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/collection.d.ts
export class Collection {
  declare _filters: Array<Filter>;
  declare _limit: ?number;
  declare _sortDirection: 'asc' | 'desc';
  declare _sortKey: string;
  declare _table: Table;

  constructor(table: Table) {
    this._table = table;
    this._filters = [];
    this._limit = null;
    this._sortDirection = 'asc';
    this._sortKey = '';
  }

  and = (filter: Filter) => {
    this._filters.push(filter);
    return this;
  }

  limit = (limit: number) => {
    this._limit = limit;
    return this;
  }

  reverse = () => {
    this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
    return this;
  }

  sortBy = (key: string) => {
    this._sortKey = key;
    return this;
  }

  toArray = async (): Promise<Array<any>> => {
    const initialRecords = [...this._table.records];

    const filteredRecords = this._filters.reduce(
      (records, filter) => records.filter(filter),
      initialRecords,
    );

    let sortedRecord = filteredRecords;

    if (this._sortKey) {
      const sortFunction = makeSortFunction(this._sortKey, this._sortDirection);
      sortedRecord = filteredRecords.sort(sortFunction);
    }

    if (typeof this._limit === 'number')
      return sortedRecord.slice(0, this._limit);

    return sortedRecord;
  }

  where = (key: string) => new WhereClause(this, key);
}
