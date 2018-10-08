// @flow
export class DataStoreError extends Error {
  next: ?Error;
  name: string;

  constructor(error?: Error, ...params: Array<any>) {
    super(...params);
    this.name = this.constructor.name;
    this.next = error;
  }
}

export class RecordNotFound extends DataStoreError {}
export class RecordNotUnique extends DataStoreError {}
export class SchemaError extends DataStoreError {}
export class UnknownError extends DataStoreError {}
