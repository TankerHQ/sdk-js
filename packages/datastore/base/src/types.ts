import type { Class } from '@tanker/types';

export type TableSchema = {
  name: string;
  primaryKey?: {
    name: string;
    autoIncrement: boolean;
  };
  indexes?: Array<Array<string>>;
  persistent?: boolean;
  deleted?: boolean;
};

export type Schema = {
  version: number;
  tables: Array<TableSchema>;
};

export type BaseConfig = {
  dbName: string;
  url?: string;
  schemas: Array<Schema>;
  defaultVersion: number;
};

export type SortParams = ReadonlyArray<string | Record<string, 'asc' | 'desc'>>;

export interface DataStore {
  readonly className: string;
  bulkAdd(table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>): Promise<void>;
  bulkPut(table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>): Promise<void>;
  bulkDelete(table: string, records: Array<Record<string, any>> | Record<string, any>, ...otherRecords: Array<Record<string, any>>): Promise<void>;
  clear(table: string): Promise<void>;
  close(): Promise<void>;
  defineSchemas(schemas: Array<Schema>): Promise<void>;
  destroy(): Promise<void>;
  find(table: string, query?: {
    selector?: Record<string, any>;
    sort?: SortParams;
    limit?: number;
  }): Promise<Array<Record<string, any>>>;
  first(table: string, query?: {
    selector?: Record<string, any>;
    sort?: SortParams;
  }): Promise<Record<string, any>>;
  get(table: string, id: string): Promise<Record<string, any>>;
  getAll(table: string): Promise<Array<Record<string, any>>>;
  add(table: string, record: Record<string, any>): Promise<any>;
  put(table: string, record: Record<string, any>): Promise<void>;
  delete(table: string, id: string): Promise<void>;
  version(): number;
}

export type DataStoreAdapter = Class<DataStore> & {
  open(config: BaseConfig): Promise<DataStore>;
};
