// @flow
import { Collection } from './collection'; // eslint-disable-line import/no-cycle
import { BulkError, ConstraintError } from './errors';

// Implements a subset of the Dexie Table interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/table.d.ts
export class Table {
  declare definition: string;
  declare name: string;
  declare records: Array<Object>;

  constructor(name: string, definition: string) {
    this.definition = definition;
    this.name = name;
    this.records = [];
  }

  setDefinition = (definition: string) => { this.definition = definition; };

  clear = async () => { this.records = []; };

  toArray = async () => [...this.records];

  add = async (record: Object) => {
    const { _id } = record;
    if (this.records.some(r => r._id === _id)) { // eslint-disable-line no-underscore-dangle
      throw new ConstraintError();
    }
    this.records.push(record);
  }

  get = async (id: string) => this.records.find(r => r._id === id); // eslint-disable-line no-underscore-dangle

  put = async (record: Object) => {
    const { _id } = record;
    const prevIndex = this.records.findIndex(r => r._id === _id); // eslint-disable-line no-underscore-dangle
    if (prevIndex !== -1) {
      this.records[prevIndex] = record;
    } else {
      this.records.push(record);
    }
  }

  delete = async (id: string) => {
    const index = this.records.findIndex(r => r._id === id); // eslint-disable-line no-underscore-dangle
    if (index !== -1) {
      this.records.splice(index, 1);
    }
  }

  bulkAdd = async (records: Array<Object>) => {
    const failures = [];
    for (const record of records) {
      try {
        await this.add(record);
      } catch (e) {
        failures.push(e);
      }
    }
    if (failures.length > 0) {
      throw new BulkError(failures);
    }
  }

  bulkPut = async (records: Array<Object>) => {
    for (const record of records) {
      await this.put(record);
    }
  }

  bulkDelete = async (records: Array<Object>) => {
    for (const record of records) {
      await this.delete(record);
    }
  }

  toArray = () => new Collection(this).toArray();

  // chainable methods
  limit = (limit: number) => new Collection(this).limit(limit);
  orderBy = (key: string) => new Collection(this).sortBy(key);
  reverse = () => new Collection(this).reverse();
  where = (key: string) => new Collection(this).where(key);
}
