// @flow
import { utils, type b64string } from '@tanker/crypto';
import { TankerError } from '@tanker/errors';

// Re-expose these common error classes:
export { TankerError, InvalidArgument, NetworkError } from '@tanker/errors';

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

export class ExpiredVerification extends TankerError {
  constructor(message: string) {
    super('ExpiredVerification', message);
  }
}

export class GroupTooBig extends TankerError {
  constructor(message: string) {
    super('GroupTooBig', message);
  }
}

export class InternalError extends TankerError {
  constructor(message: string) {
    super('InternalError', message);
  }
}

export class InvalidVerification extends TankerError {
  constructor(message: string) {
    super('InvalidVerification', message);
  }
}

export class OperationCanceled extends TankerError {
  constructor(message: string = 'Operation canceled') {
    super('OperationCanceled', message);
  }
}

export class PreconditionFailed extends TankerError {
  constructor(message: string) {
    super('PreconditionFailed', message);
  }
}

export class TooManyAttempts extends TankerError {
  constructor(message: string) {
    super('TooManyAttempts', message);
  }
}
