export class InvalidBlockError extends Error {
  nature: string;
  args: Record<string, any>;

  constructor(nature: string, message: string, e: Record<string, any>) {
    super(message);
    this.name = 'InvalidBlockError';
    this.nature = nature;
    this.args = e;
  }
}
