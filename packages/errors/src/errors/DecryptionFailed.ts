import { TankerError } from '../TankerError';

export class DecryptionFailed extends TankerError {
  b64ResourceId?: string;

  next?: Error;

  constructor(args: { error?: Error; message?: string; b64ResourceId?: string; }) {
    const { error, b64ResourceId } = args;
    let message = args.message;

    if (b64ResourceId) {
      if (!message) {
        message = `resource ${b64ResourceId} decryption failed`;
        if (error) message += `, with: ${error.toString()}`;
      }
    }

    super('DecryptionFailed', message);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DecryptionFailed.prototype);

    this.next = error;
    this.b64ResourceId = b64ResourceId;
  }
}
