// @flow

import EventEmitter from 'events';
import { tcrypto, utils } from '@tanker/crypto';
import { ExpiredVerification, GroupTooBig, InternalError, InvalidArgument, InvalidVerification, PreconditionFailed, TooManyAttempts, DeviceRevoked, Conflict } from '@tanker/errors';

import { VerificationNeeded } from '../errors.internal';
import type { SdkInfo } from './SdkInfo';

import { type Authenticator, takeChallenge } from './Authenticator';

const defaultApiAddress = 'https://api.tanker.io';

export type ClientOptions = {
  url?: string,
  connectTimeout?: number,
  sdkInfo: SdkInfo,
}

const isObject = (val: Object) => !!val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype;

export function b64RequestObject(requestObject: any): any {
  if (requestObject instanceof Uint8Array) {
    return utils.toBase64(requestObject);
  }

  if (Array.isArray(requestObject)) {
    return requestObject.map(elem => b64RequestObject(elem));
  }

  if (!isObject(requestObject))
    throw new InternalError('Assertion error: b64RequestObject operates only on Object, Array and Uint8Array instances');

  const result = {};

  Object.entries(requestObject).forEach(([key, value]) => {
    if (value instanceof Uint8Array) {
      result[key] = utils.toBase64(value);
    } else if (Array.isArray(value)) {
      result[key] = b64RequestObject(value);
    } else if (isObject(value)) {
      result[key] = b64RequestObject(value);
    } else {
      result[key] = value;
    }
  });

  return result;
}

const serverErrorMap = {
  device_not_found: InvalidVerification,
  group_too_big: GroupTooBig,
  invalid_delegation_signature: InvalidVerification,
  invalid_oidc_id_token: InvalidVerification,
  invalid_passphrase: InvalidVerification,
  invalid_verification_code: InvalidVerification,
  too_many_attempts: TooManyAttempts,
  provisional_identity_already_attached: InvalidArgument,
  verification_code_expired: ExpiredVerification,
  verification_code_not_found: InvalidVerification,
  verification_method_not_set: PreconditionFailed,
  verification_needed: VerificationNeeded,
  verification_key_not_found: PreconditionFailed,
  device_revoked: DeviceRevoked,
  conflict: Conflict,
};

/**
 * Network communication
 */
export class Client extends EventEmitter {
  _appId: Uint8Array;
  _authenticator: ?Authenticator;
  _authenticating: ?Promise<void>;
  _authenticated: bool = false;
  _options: ClientOptions;

  constructor(appId: Uint8Array, options: ClientOptions) {
    super();
    this._options = { url: defaultApiAddress, ...options };
    this._appId = appId;
  }

  authenticate = async (userId: Uint8Array, signatureKeyPair: tcrypto.SodiumKeyPair) => {
    if (this._authenticator)
      throw new InternalError('Assertion error: client is already authenticated');

    this._authenticator = (challenge) => takeChallenge(this._appId, userId, signatureKeyPair, challenge);

    return this._authenticate();
  }

  _authenticate = async () => {
    if (this._authenticated || !this._authenticator) {
      return;
    }

    if (this._authenticating) {
      return this._authenticating;
    }

    const auth = async () => {
      const { challenge } = await this._unauthenticatedSend('request auth challenge');

      if (!this._authenticator)
        throw new InternalError('Assertion error: missing authenticator');

      const { signature, publicSignatureKey, trustchainId, userId } = this._authenticator(challenge);

      return this._unauthenticatedSend('authenticate device', b64RequestObject({
        signature,
        public_signature_key: publicSignatureKey,
        trustchain_id: trustchainId,
        user_id: userId,
      }));
    };

    this._authenticating = auth().then(() => {
      this._authenticated = true;
    }).finally(() => {
      this._authenticating = null;
    });

    return this._authenticating;
  }

  async remoteStatus(trustchainId: Uint8Array, userId: Uint8Array, publicSignatureKey: Uint8Array) {
    const request = {
      trustchain_id: trustchainId,
      user_id: userId,
      device_public_signature_key: publicSignatureKey,
    };

    const reply = await this.send('get user status', b64RequestObject(request));

    return {
      deviceExists: reply.device_exists,
      userExists: reply.user_exists,
    };
  }

  close(): void {
    // purge authentication handler
    this._authenticator = null;
    this._authenticated = false;
  }

  async send(route: string, payload: any, rawData: bool = false): Promise<any> {
    await this._authenticate();
    return this._send(route, payload, rawData);
  }

  async _unauthenticatedSend(route: string, payload: any): Promise<any> {
    return this._send(route, payload, false);
  }

  // Make all socket.io server calls fail - TODO: replace by new HTTP APIs
  async _send(apiRoute: string, payload: any, rawData: bool): Promise<any> {
    throw new Error(`FAIL calling _send(${apiRoute})`);
  }
}
