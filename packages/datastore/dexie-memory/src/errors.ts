export class BulkError extends Error {
  declare failures: ReadonlyArray<Error>;

  constructor(errors: ReadonlyArray<Error>) {
    super();
    Object.setPrototypeOf(this, BulkError.prototype);

    this.name = 'BulkError';
    this.failures = errors;
  }
}

export class ConstraintError extends Error {
  constructor() {
    super();
    Object.setPrototypeOf(this, ConstraintError.prototype);

    this.name = 'ConstraintError';
  }
}
