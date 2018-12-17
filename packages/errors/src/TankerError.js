// @flow
export default class TankerError extends Error {
  nature: string;

  constructor(nature: string, details: ?string) {
    let message = `Tanker error: ${nature}`;
    if (details) {
      message += `, ${details}`;
    }

    super(message);

    this.nature = nature;
  }
}
