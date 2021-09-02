export class BulkError extends Error {
  declare failures: ReadonlyArray<Error>;

  constructor(errors: ReadonlyArray<Error>) {
    super();
    this.name = 'BulkError';
    this.failures = errors;
  }
}

export class ConstraintError extends Error {
  constructor() {
    super();
    this.name = 'ConstraintError';
  }
}
