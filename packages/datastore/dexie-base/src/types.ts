export type IndexableTypePart = string | number | Date | ArrayBuffer | ArrayBufferView | DataView | Array<Array<void>>;
export type IndexableTypeArray = Array<IndexableTypePart>;
export type IndexableTypeArrayReadonly = ReadonlyArray<IndexableTypePart>;
export type IndexableType = IndexableTypePart | IndexableTypeArrayReadonly;

// Implements a subset of the Dexie Collection interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/collection.d.ts
export interface ICollection {
  and(filter: (x: Record<string, any>) => boolean): ICollection;
  limit(limit: number): ICollection;
  reverse(): ICollection;
  sortBy(key: string): Promise<Array<Record<string, any>>>;
  toArray(): Promise<Array<Record<string, any>>>;
}

// Implements a subset of the Dexie WhereClause interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/where-clause.d.ts
export interface IWhereClause {
  above(value: any): ICollection;
  aboveOrEqual(value: any): ICollection;
  anyOf(values: Array<any>): ICollection;
  below(value: any): ICollection;
  belowOrEqual(value: any): ICollection;
  equals(value: any): ICollection;
  notEqual(value: any): ICollection;
}

// Implements a subset of the Dexie Table interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/table.d.ts
export interface ITable {
  clear(): Promise<void>;
  add(record: Record<string, any>): Promise<IndexableType>;
  get(id: IndexableType): Promise<Record<string, any> | undefined>;
  put(record: Record<string, any>): Promise<IndexableType>;
  delete(id: IndexableType): Promise<void>;
  bulkAdd(record: ReadonlyArray<Record<string, any>>): Promise<IndexableType>;
  bulkPut(record: ReadonlyArray<Record<string, any>>): Promise<IndexableType>;
  bulkDelete(ids: ReadonlyArray<IndexableType>): Promise<void>;
  toArray(): Promise<Array<Record<string, any>>>;
  limit(limit: number): ICollection;
  orderBy(key: string): ICollection;
  reverse(): ICollection;
  where(key: string): IWhereClause;
}

type Class<T> = { prototype: T; };

// Implements a subset of the Dexie interface
// See: https://github.com/dfahlander/Dexie.js/blob/master/src/public/types/dexie.d.ts
export interface IDexie {
  version(version: number): { stores: (schema: Record<string, string | null>) => unknown };
  table(name: string): ITable;
  open(): Promise<IDexie>;
  close(): void;
  delete(): Promise<void>;

  readonly verno: number;

  Table: Class<ITable>;
  Collection: Class<ICollection>;
  WhereClause: Class<IWhereClause>;
}
