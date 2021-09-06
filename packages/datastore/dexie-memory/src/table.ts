import type { ITable } from '@tanker/datastore-dexie-base';

import { Collection } from './collection';
import { BulkError, ConstraintError } from './errors';

export class Table implements ITable {
  declare definition: string;
  declare name: string;
  declare records: Array<Record<string, any>>;

  constructor(name: string, definition: string) {
    this.definition = definition;
    this.name = name;
    this.records = [];
  }

  setDefinition = (definition: string) => { this.definition = definition; };

  clear = async () => { this.records = []; };

  add = async (record: Record<string, any>) => {
    if (this.records.some(r => r['_id'] === record['_id'])) {
      throw new ConstraintError();
    }

    this.records.push(record);
    return record['_id'];
  };

  get = async (id: string) => this.records.find(r => r['_id'] === id);

  put = async (record: Record<string, any>) => {
    const prevIndex = this.records.findIndex(r => r['_id'] === record['_id']);

    if (prevIndex !== -1) {
      this.records[prevIndex] = record;
    } else {
      this.records.push(record);
    }
    return record['_id'];
  };

  delete = async (id: string) => {
    const index = this.records.findIndex(r => r['_id'] === id);

    if (index !== -1) {
      this.records.splice(index, 1);
    }
  };

  bulkAdd = async (records: readonly Record<string, any>[]) => {
    const failures: Error[] = [];
    let res!: string;

    for (const record of records) {
      try {
        res = await this.add(record);
      } catch (e) {
        failures.push(e as Error);
      }
    }

    if (failures.length > 0) {
      throw new BulkError(failures);
    }
    return res;
  };

  bulkPut = async (records: readonly Record<string, any>[]) => {
    let res!: string;
    for (const record of records) {
      await this.put(record);
    }

    return res;
  };

  bulkDelete = async (records: ReadonlyArray<string>) => {
    for (const record of records) {
      await this.delete(record);
    }
  };

  toArray = async () => new Collection(this).toArray();

  // chainable methods
  limit = (limit: number) => new Collection(this).limit(limit);
  orderBy = (key: string) => new Collection(this).orderBy(key);
  reverse = () => new Collection(this).reverse();
  where = (key: string) => new Collection(this).where(key);
}
