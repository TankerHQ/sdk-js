import type { ICollection } from '@tanker/datastore-dexie-base';

import type { Table } from './table';

import { WhereClause } from './where-clause';

import { makeSortFunction } from './utils';

export class Collection implements ICollection {
  declare _filters: Array<(x: Record<string, any>) => boolean>;
  declare _limit: number | null;
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

  and = (filter: (x: Record<string, any>) => boolean) => {
    this._filters.push(filter);

    return this;
  };

  limit = (limit: number) => {
    this._limit = limit;
    return this;
  };

  reverse = () => {
    this._sortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc';
    return this;
  };

  orderBy = (key: string) => {
    this._sortKey = key;
    return this;
  };

  sortBy = (key: string) => this.orderBy(key).toArray();

  toArray = async () => {
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
  };

  where = (key: string) => new WhereClause(this, key);
}
