// @flow
export class BulkError extends Error {
  declare failures: $ReadOnlyArray<Error>;

  constructor(errors: $ReadOnlyArray<Error>) {
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
