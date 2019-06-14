// @flow
export class InvalidBlockError extends Error {
  nature: string;
  args: Object;

  constructor(nature: string, message: string, e: Object) {
    super(message);
    this.name = 'InvalidBlockError';
    this.nature = nature;
    this.args = e;
  }
}

export class VerificationNeeded extends Error {
  constructor() {
    super();
    this.name = 'VerificationNeeded';
  }
}

export class UpgradeRequiredError extends Error {
  constructor(message: string) {
    super(`Tanker must be upgraded to a newer version to continue: ${message}`);
    this.name = 'UpgradeRequiredError';
  }
}
