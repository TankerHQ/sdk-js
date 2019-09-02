// @flow
import { utils, type b64string } from '@tanker/crypto';
import { TankerError } from '@tanker/errors';

// Re-expose these common error classes:
export {
  ExpiredVerification,
  GroupTooBig,
  InternalError,
  InvalidArgument,
  InvalidVerification,
  NetworkError,
  OperationCanceled,
  PreconditionFailed,
  TankerError,
  TooManyAttempts,
} from '@tanker/errors';

export class DecryptionFailed extends TankerError {
  b64ResourceId: ?b64string;
  next: ?Error;

  constructor(args: { error?: Error, message?: string, resourceId?: Uint8Array }) {
    const { error, resourceId } = args;
    let message = args.message;
    let b64ResourceId;

    if (resourceId) {
      b64ResourceId = utils.toBase64(resourceId);

      if (!message) {
        message = `resource ${b64ResourceId} decryption failed`;
        if (error) message += `with: ${error.toString()}`;
      }
    }

    super('DecryptionFailed', message);

    this.next = error;
    this.b64ResourceId = b64ResourceId;
  }
}
