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
