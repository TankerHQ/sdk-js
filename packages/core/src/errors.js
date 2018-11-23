// @flow

import { utils, type b64string } from '@tanker/crypto';

type ErrorNature = (
  'resource_not_found' |
  'decrypt_failed' |
  'invalid_user_secret' |
  'invalid_user_token' |
  'invalid_unlock_key' |
  'invalid_unlock_password' |
  'max_verification_attempts_reached' |
  'invalid_session_status' |
  'invalid_argument' |
  'invalid_device_validation_code' |
  'invalid_seal' |
  'invalid_encryption_format' |
  'invalid_unlock_verification_code' |
  'server_error' |
  'invalid_delegation_token' |
  'missing_event_handler' |
  'chunk_index_out_of_range' |
  'chunk_not_found' |
  'authentication_error' |
  'recipients_not_found' |
  'user_not_found' |
  'invalid_group_size' |
  'operation_canceled' |
  'broken_stream' |
  'stream_already_closed'
);

export class TankerError extends Error {
  nature: ErrorNature;

  constructor(nature: ErrorNature, details: ?string) {
    let message = `Tanker error: ${nature}`;
    if (details) {
      message += `, ${details}`;
    }

    super(message);

    this.nature = nature;
  }
}

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

function getTypeAsString(value) {
  // only check the built-ins we care about in the API
  if (value instanceof Array)
    return 'Array';
  else if (value instanceof Uint8Array)
    return 'Uint8Array';

  return typeof value;
}

export class InvalidArgument extends TankerError {
  constructor(name: string, expectedType: string, value: any) {
    let quotedValue;
    try {
      quotedValue = JSON.stringify(value);
    } catch (e) {
      quotedValue = value;
    }

    const foundType = getTypeAsString(value);

    super('invalid_argument', `name: ${name} (${expectedType}), value: ${quotedValue} (${foundType})`);
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

export class BrokenStream extends TankerError {
  error: Error;

  constructor(error: Error) {
    let msg = '';
    if (error.message) {
      msg = `: ${error.message}`;
    }

    super('broken_stream', `an error broke the stream${msg}`);

    this.error = error;
  }
}

export class StreamAlreadyClosed extends TankerError {
  constructor() {
    super('stream_already_closed', 'close has already been called on this stream');
  }
}

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

export class NotEnoughData extends Error {
  message: string;

  constructor(message: string) {
    super(`Not enough data available: ${message}`);
    this.name = 'NotEnoughData';
    this.message = message;
  }
}
