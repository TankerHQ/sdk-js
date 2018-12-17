// @flow
import { utils, type b64string } from '@tanker/crypto';
import { TankerError } from '@tanker/errors';

// Re-expose these common error classes:
export { TankerError, InvalidArgument } from '@tanker/errors';

export class ResourceNotFound extends TankerError {
  b64Mac: b64string;

  constructor(resourceId: Uint8Array) {
    const b64Mac = utils.toBase64(resourceId);
    super('resource_not_found', b64Mac);
    this.b64Mac = b64Mac;
  }
}

export class DecryptFailed extends TankerError {
  next: Error;
  b64Mac: b64string;
  chunkIndex: ?number;

  constructor(e: Error, resourceId: Uint8Array, chunkIndex?: number) {
    super('decrypt_failed');

    this.next = e;
    this.b64Mac = utils.toBase64(resourceId);
    this.chunkIndex = chunkIndex;
  }
}

export class InvalidUserToken extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('invalid_user_token');

    this.next = e;
  }
}

export class InvalidUnlockKey extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('invalid_unlock_key');

    this.next = e;
  }
}

export class InvalidUnlockPassword extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('invalid_unlock_password');

    this.next = e;
  }
}

export class InvalidUnlockVerificationCode extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('invalid_unlock_verification_code');

    this.next = e;
  }
}

export class MaxVerificationAttemptsReached extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('max_verification_attempts_reached');

    this.next = e;
  }
}

export class InvalidSessionStatus extends TankerError {
  status: number;

  constructor(status: number, message: string = `status: ${status}`) {
    super('invalid_session_status', message);

    this.status = status;
  }
}

export class OperationCanceled extends TankerError {
  constructor(message: string = 'Operation canceled') {
    super('operation_canceled', message);
  }
}

export class InvalidDeviceValidationCode extends TankerError {
  next: Error;

  constructor(e: Error) {
    super('invalid_device_validation_code');
    this.next = e;
  }
}

export class InvalidSeal extends TankerError {
  next: ?Error;

  constructor(message: string, e: ?Error) {
    super('invalid_seal', message);
    this.next = e;
  }
}

export class InvalidEncryptionFormat extends TankerError {
  constructor(message: string) {
    super('invalid_encryption_format', message);
  }
}

export class ServerError extends TankerError {
  error: Object;
  b64TrustchainId: b64string;

  constructor(error: Object, trustchainId: Uint8Array) {
    const b64TrustchainId = utils.toBase64(trustchainId);
    super('server_error', `status: ${error.status}, code: ${error.code}, message: ${error.message}, trustchainId: ${b64TrustchainId}`);
    this.error = error;
    this.b64TrustchainId = b64TrustchainId;
  }
}

export class InvalidDelegationToken extends TankerError {
  constructor(message: string) {
    super('invalid_delegation_token', message);
  }
}

export class MissingEventHandler extends TankerError {
  constructor(eventName: string) {
    const message = `it is mandatory to add an event handler for the "${eventName}" event`;
    super('missing_event_handler', message);
  }
}

export class ChunkIndexOutOfRange extends TankerError {
  constructor(index: number, length: number) {
    const message = `index ${index} outside [0, ${length}) range`;
    super('chunk_index_out_of_range', message);
  }
}

export class ChunkNotFound extends TankerError {
  constructor(index: number) {
    const message = `no chunk found at index ${index}`;
    super('chunk_not_found', message);
  }
}

export class AuthenticationError extends TankerError {
  next: Error;

  constructor(e: any) {
    super('authentication_error', `couldn't authenticate: ${e.message}`);
    this.next = e;
  }
}

export class RecipientsNotFound extends TankerError {
  recipientIds: Array<string>;

  constructor(recipientIds: Array<string>) {
    super('recipients_not_found', `Recipient(s) '${recipientIds.join(', ')}' not found`);

    this.recipientIds = recipientIds;
  }
}

export class InvalidGroupSize extends TankerError {
  constructor(msg: string) {
    super('invalid_group_size', msg);
  }
}
