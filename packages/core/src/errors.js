// @flow
import { utils, type b64string } from '@tanker/crypto';
import { TankerError } from '@tanker/errors';

// Re-expose these common error classes:
export { TankerError, InvalidArgument, NotEnoughData } from '@tanker/errors';
export { InvalidIdentity } from '@tanker/identity';

export class ResourceNotFound extends TankerError {
  b64ResourceId: b64string;

  constructor(resourceId: Uint8Array) {
    const b64ResourceId = utils.toBase64(resourceId);
    super('ResourceNotFound', b64ResourceId);
    this.b64ResourceId = b64ResourceId;
  }
}

export class DecryptFailed extends TankerError {
  b64ResourceId: b64string;
  next: Error;

  constructor(e: Error, resourceId: Uint8Array) {
    const b64ResourceId = utils.toBase64(resourceId);
    let message;

    try {
      message = `resource ${b64ResourceId} decryption failed with: ${e.toString()}`;
    } catch (err) {
      message = `resource ${b64ResourceId} decryption failed`;
    }

    super('DecryptFailed', message);

    this.next = e;
    this.b64ResourceId = b64ResourceId;
  }
}

export class InvalidUnlockKey extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('InvalidUnlockKey');
    this.next = e;
  }
}

export class InvalidUnlockPassword extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('InvalidUnlockPassword');
    this.next = e;
  }
}

export class InvalidUnlockVerificationCode extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('InvalidUnlockVerificationCode');
    this.next = e;
  }
}

export class MaxVerificationAttemptsReached extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('MaxVerificationAttemptsReached');
    this.next = e;
  }
}

export class InvalidSessionStatus extends TankerError {
  isOpen: bool;

  // $FlowIKnow
  constructor(isOpen: bool, message: string = `isOpen: ${isOpen}`) {
    super('InvalidSessionStatus', message);
    this.isOpen = isOpen;
  }
}

export class OperationCanceled extends TankerError {
  constructor(message: string = 'Operation canceled') {
    super('OperationCanceled', message);
  }
}

export class InvalidEncryptionFormat extends TankerError {
  constructor(message: string) {
    super('InvalidEncryptionFormat', message);
  }
}

export class ServerError extends TankerError {
  error: Object;
  b64TrustchainId: b64string;

  constructor(error: Object, trustchainId: Uint8Array) {
    const b64TrustchainId = utils.toBase64(trustchainId);
    const message = `status: ${error.status}, code: ${error.code}, message: ${error.message}, trustchainId: ${b64TrustchainId}`;
    super('ServerError', message);
    this.error = error;
    this.b64TrustchainId = b64TrustchainId;
  }
}

export class InvalidDelegationToken extends TankerError {
  constructor(message: string) {
    super('InvalidDelegationToken', message);
  }
}

export class AuthenticationError extends TankerError {
  next: Error;

  constructor(e: any) {
    super('AuthenticationError', `couldn't authenticate: ${e.message}`);
    this.next = e;
  }
}

export class RecipientsNotFound extends TankerError {
  recipientIds: Array<string>;

  constructor(recipientIds: Array<string>) {
    super('RecipientsNotFound', `Recipient(s) '${recipientIds.join(', ')}' not found`);

    this.recipientIds = recipientIds;
  }
}

export class InvalidGroupSize extends TankerError {
  constructor(msg: string) {
    super('InvalidGroupSize', msg);
  }
}

export class IdentityAlreadyRegistered extends TankerError {
  constructor(msg: string) {
    super('IdentityAlreadyRegistered', msg);
  }
}

export class NothingToClaim extends TankerError {
  constructor(msg: string) {
    super('NothingToClaim', msg);
  }
}
