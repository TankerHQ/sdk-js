export class DataStoreError extends Error {
  next?: Error;
  name: string;

  constructor(name: string, error?: Error, messageArg?: string) {
    const message = messageArg || error && error.toString() || '';
    super(message);
    this.name = name;
    this.next = error;
  }
}

export class RecordNotFound extends DataStoreError {
  constructor(error?: Error) {
    super('RecordNotFound', error);
  }
}

export class RecordNotUnique extends DataStoreError {
  constructor(error?: Error) {
    super('RecordNotUnique', error);
  }
}

export class SchemaError extends DataStoreError {
  constructor(message: string) {
    super('SchemaError', null, message);
  }
}

export class UnknownError extends DataStoreError {
  constructor(error?: Error) {
    super('UnknownError', error);
  }
}

export class VersionError extends DataStoreError {
  constructor(error?: Error) {
    super('VersionError', error);
  }
}
