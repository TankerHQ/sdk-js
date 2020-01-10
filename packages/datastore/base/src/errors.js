// @flow
export class DataStoreError extends Error {
  next: ?Error;
  name: string;
  message: string;

  constructor(name: string, error?: Error, ...params: Array<any>) {
    super(...params);
    this.name = name;
    this.message = name;
    this.next = error;
  }
}

export class RecordNotFound extends DataStoreError {
  constructor(error?: Error, ...params: Array<any>) {
    super('RecordNotFound', error, ...params);
  }
}
export class RecordNotUnique extends DataStoreError {
  constructor(error?: Error, ...params: Array<any>) {
    super('RecordNotUnique', error, ...params);
  }
}
export class SchemaError extends DataStoreError {
  constructor(error?: Error, ...params: Array<any>) {
    super('SchemaError', error, ...params);
  }
}
export class UnknownError extends DataStoreError {
  constructor(error?: Error, ...params: Array<any>) {
    super('UnknownError', error, ...params);
  }
}
