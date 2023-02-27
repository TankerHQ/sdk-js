export class DataStoreError extends Error {
  next?: Error | null;
  override name: string;

  constructor(name: string, error?: Error | null, messageArg?: string) {
    const message = messageArg || error && error.toString() || '';
    super(message);
    Object.setPrototypeOf(this, DataStoreError.prototype);

    this.name = name;
    this.next = error;
  }
}

export class RecordNotFound extends DataStoreError {
  constructor(error?: Error) {
    super('RecordNotFound', error);
    Object.setPrototypeOf(this, RecordNotFound.prototype);
  }
}

export class RecordNotUnique extends DataStoreError {
  constructor(error?: Error) {
    super('RecordNotUnique', error);
    Object.setPrototypeOf(this, RecordNotUnique.prototype);
  }
}

export class SchemaError extends DataStoreError {
  constructor(message: string) {
    super('SchemaError', null, message);
    Object.setPrototypeOf(this, SchemaError.prototype);
  }
}

export class UnknownError extends DataStoreError {
  constructor(error?: Error) {
    super('UnknownError', error);
    Object.setPrototypeOf(this, UnknownError.prototype);
  }
}

export class VersionError extends DataStoreError {
  constructor(error?: Error) {
    super('VersionError', error);
    Object.setPrototypeOf(this, VersionError.prototype);
  }
}

export class DataStoreClosedError extends DataStoreError {
  constructor(error?: Error) {
    super('DataStoreClosedError', error);
    Object.setPrototypeOf(this, DataStoreClosedError.prototype);
  }
}
