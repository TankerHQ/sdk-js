// @flow
export type TableSchema = {|
  name: string,
  primaryKey?: { name: string, autoIncrement: bool },
  indexes?: Array<Array<string>>,
  persistent?: bool
|};

export type Schema = {|
  version: number,
  tables: Array<TableSchema>
|};

export type BaseConfig = {|
  dbName: string,
  url?: string,
  schemas?: Array<Schema>
|};

export type SortParams = $ReadOnlyArray<string | { [string]: 'asc' | 'desc' }>;

/**
 * Flow:
 *   +prop: read-only prop
 *   -prop: write-only prop
 */
export interface DataStore<DB> {
  +className: string;
  bulkAdd(table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>): Promise<void>;
  bulkPut(table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>): Promise<void>;
  bulkDelete(table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>): Promise<void>;
  clear(table: string): Promise<void>;
  close(): Promise<void>;
  constructor(db: DB): DataStore<DB>;
  defineSchemas(schemas: Array<Schema>): Promise<void>;
  destroy(): Promise<void>;
  find(table: string, query?: { selector?: Object, sort?: SortParams, limit?: number }): Promise<Array<Object>>;
  first(table: string, query?: { selector?: Object, sort?: SortParams }): Promise<Object>;
  get(table: string, id: string): Promise<Object>;
  getAll(table: string): Promise<Array<Object>>;
  add(table: string, record: Object): Promise<void>;
  put(table: string, record: Object): Promise<void>;
  delete(table: string, id: string): Promise<void>;
  // static open(config: BaseConfig): Promise<DataStore<DB>>;
}
