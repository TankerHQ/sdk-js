// @flow

import EventEmitter from 'events';
import Socket from 'socket.io-client';
import { tcrypto, utils } from '@tanker/crypto';
import { ExpiredVerification, GroupTooBig, InternalError, InvalidArgument, InvalidVerification, NetworkError, OperationCanceled, PreconditionFailed, TooManyAttempts, DeviceRevoked } from '@tanker/errors';

import { VerificationNeeded } from '../errors.internal';
import SocketIoWrapper, { type Listener, type SdkInfo } from './SocketIoWrapper';

import { type Authenticator, takeChallenge } from './Authenticator';

const defaultApiAddress = 'https://api.tanker.io';

export type ClientOptions = {
  socket?: Socket,
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
};

/**
 * Network communication
 */
export class Client extends EventEmitter {
  socket: SocketIoWrapper;
  trustchainId: Uint8Array;
  eventListeners: Map<number, Listener>;
  eventListenerCounter: number;
  _authenticator: ?Authenticator;
  _abortOpen: ?() => void;
  _opening: ?Promise<void>;
  _authenticating: ?Promise<void>;
  _authenticated: bool = false;

  constructor(trustchainId: Uint8Array, options?: ClientOptions) {
    super();
    this.trustchainId = trustchainId;

    this.eventListenerCounter = 0;
    this.eventListeners = new Map();

    // By default, the socket.io client has the following options set to true:
    //   -> autoConnect: no need to call socket.open()
    //   -> reconnection: will reconnect automatically after disconnection
    const opts = { ...options };
    if (!opts.url) { opts.url = defaultApiAddress; }

    this.socket = new SocketIoWrapper(opts);
  }

  authenticate = async (userId: Uint8Array, signatureKeyPair: tcrypto.SodiumKeyPair) => {
    if (this._authenticator)
      throw new InternalError('Assertion error: client is already authenticated');

    this._authenticator = (challenge) => takeChallenge(this.trustchainId, userId, signatureKeyPair, challenge);

    this.registerListener('disconnect', () => {
      this._authenticated = false;
    });

    this.registerListener('reconnect', () => {
      this._authenticate().catch((e) => this.emit('authentication_failed', e));
    });
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

  registerListener = (event: string, handler: (...Array<any>) => void): number => {
    const id = this.eventListenerCounter;
    this.eventListenerCounter += 1;
    this.eventListeners.set(id, { event, handler });
    this.socket.on(event, handler);
    return id;
  }

  unregisterListener = (id: number): void => {
    const listener = this.eventListeners.get(id);
    if (!listener)
      throw new InternalError('Assertion error: removing unknown listener');
    const { event, handler } = listener;
    this.eventListeners.delete(id);
    this.socket.removeListener(event, handler);
  }

  unregisterListeners = () => {
    // Map.values() not available on IE11
    this.eventListeners.forEach((listener, id) => {
      this.unregisterListener(id);
    });

    this.eventListeners = new Map();
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

  async open(): Promise<void> {
    if (this.socket.isOpen()) {
      return;
    }
    if (this._opening) {
      return this._opening;
    }
    this._opening = new Promise((resolve, reject) => {
      let connectListenerId;
      let errorListenerId;

      const cleanup = () => {
        this.unregisterListener(connectListenerId);
        this.unregisterListener(errorListenerId);
        this._abortOpen = null;
        this._opening = null;
      };

      this._abortOpen = () => {
        const error = new OperationCanceled('client opening aborted');
        cleanup();
        this.socket.abortRequests(error);
        reject(error);
      };

      connectListenerId = this.registerListener('connect', () => { cleanup(); resolve(); });
      errorListenerId = this.registerListener('connect_error', (err) => {
        const error = new NetworkError(`can't connect socket: ${err && err.message} ${err && err.description && err.description.message}`);
        cleanup();
        this.socket.abortRequests(error);
        reject(error);
      });

      this.socket.open();
    });

    return this._opening;
  }

  close(): void {
    if (this._abortOpen) {
      this._abortOpen();
    }

    // purge socket event listeners
    this.unregisterListeners();

    // purge authentication handler
    this._authenticator = null;
    this._authenticated = false;

    this.socket.close();
  }

  async send(route: string, payload: any, rawData: bool = false): Promise<any> {
    await this.open();
    await this._authenticate();
    return this._send(route, payload, rawData);
  }

  async _unauthenticatedSend(route: string, payload: any): Promise<any> {
    await this.open();
    return this._send(route, payload, false);
  }

  async _send(route: string, payload: any, rawData: bool): Promise<any> {
    const jdata = rawData ? payload : JSON.stringify(payload);
    const jresult = await this.socket.emit(route, jdata);
    const result = JSON.parse(jresult);
    if (result && result.error) {
      const { error } = result;
      const SpecificError = serverErrorMap[error.code];
      if (SpecificError) {
        throw new SpecificError(error.message);
      }
      throw new InternalError(`Server error on route "${route}" with status: ${error.status}, code: ${error.code}, message: ${error.message}`);
    }
    return result;
  }
}
