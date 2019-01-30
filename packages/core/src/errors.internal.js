// @flow
export class InvalidBlockError extends Error {
  nature: string;
  message: string;
  args: Object;

  constructor(nature: string, message: string, e: Object) {
    super(`invalid block: ${message}`);
    this.nature = nature;
    this.message = message;
    this.args = e;
  }
}

export class UpgradeRequiredError extends Error {
  message: string;

  constructor(message: string) {
    super(`Tanker must be upgraded to a newer version to continue: ${message}`);
    this.name = 'UpgradeRequiredError';
    this.message = message;
  }
}
