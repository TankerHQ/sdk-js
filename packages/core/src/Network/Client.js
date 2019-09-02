// @flow

import EventEmitter from 'events';
import Socket from 'socket.io-client';
import { tcrypto, generichash, utils, type b64string } from '@tanker/crypto';
import { ExpiredVerification, GroupTooBig, InternalError, InvalidArgument, InvalidVerification, NetworkError, OperationCanceled, PreconditionFailed, TooManyAttempts } from '@tanker/errors';
import { type PublicProvisionalIdentity, type PublicProvisionalUser } from '@tanker/identity';

import { type Block } from '../Blocks/Block';
import { serializeBlock } from '../Blocks/payloads';
import { VerificationNeeded } from '../errors.internal';
import SocketIoWrapper, { type SdkInfo } from './SocketIoWrapper';

import { type Authenticator, takeChallenge } from './Authenticator';

const defaultApiAddress = 'https://api.tanker.io';

export type ClientOptions = {
  socket?: Socket,
  url?: string,
  connectTimeout?: number,
  sdkInfo: SdkInfo,
}

export function b64RequestObject(requestObject: any): any {
  if (Array.isArray(requestObject)) {
    return requestObject.map(elem => b64RequestObject(elem));
  }

  const result = {};

  Object.entries(requestObject).forEach(([key, value]) => {
    if (value instanceof Uint8Array) {
      result[key] = utils.toBase64(value);
    } else if (Array.isArray(value)) {
      result[key] = b64RequestObject(value);
    } else if (value && typeof value === 'object') {
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
  invalid_passphrase: InvalidVerification,
  invalid_verification_code: InvalidVerification,
  too_many_attempts: TooManyAttempts,
  verification_code_expired: ExpiredVerification,
  verification_code_not_found: InvalidVerification,
  verification_method_not_set: PreconditionFailed,
  verification_needed: VerificationNeeded,
  verification_key_not_found: PreconditionFailed,
};

/**
 * Network communication
 */
export class Client extends EventEmitter {
  socket: SocketIoWrapper;
  trustchainId: Uint8Array;
  sessionConnections: Set<number>;
  _authenticator: ?Authenticator;
  _abortOpen: ?() => void;
  _opening: ?Promise<void>;
  _authenticating: ?Promise<void>;
  _authenticated: bool = false;

  constructor(trustchainId: Uint8Array, options?: ClientOptions) {
    super();
    this.trustchainId = trustchainId;
    this.sessionConnections = new Set();

    // By default, the socket.io client has the following options set to true:
    //   -> autoConnect: no need to call socket.open()
    //   -> reconnection: will reconnect automatically after disconnection
    const opts = { ...options };
    if (!opts.url) { opts.url = defaultApiAddress; }

    this.socket = new SocketIoWrapper(opts);

    this.registerListener('new relevant block', () => {
      this.emit('blockAvailable');
    });
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

      return this._unauthenticatedSend('authenticate device', {
        signature: utils.toBase64(signature),
        public_signature_key: utils.toBase64(publicSignatureKey),
        trustchain_id: utils.toBase64(trustchainId),
        user_id: utils.toBase64(userId),
      });
    };

    this._authenticating = auth().then(() => {
      this._authenticated = true;
    }).finally(() => {
      this._authenticating = null;
    });

    return this._authenticating;
  }

  registerListener = (event: string, cb: Function): number => {
    const id = this.socket.on(event, cb);
    this.sessionConnections.add(id);
    return id;
  }

  unregisterListener = async (id: number): Promise<void> => {
    this.sessionConnections.delete(id);
    await this.socket.removeListener(id);
  }

  unregisterListeners = async () => {
    // Warning: Set.values() does not return an array (and is not available in IE11)
    const ids = [...this.sessionConnections]; // copy into array
    this.sessionConnections = new Set();
    for (const id of ids) {
      await this.unregisterListener(id);
    }
  }

  async remoteStatus(trustchainId: Uint8Array, userId: Uint8Array, publicSignatureKey: Uint8Array) {
    const request = {
      trustchain_id: utils.toBase64(trustchainId),
      user_id: utils.toBase64(userId),
      device_public_signature_key: utils.toBase64(publicSignatureKey),
    };

    const reply = await this.send('get user status', request);

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
      let connectListener;
      let errorListener;

      const cleanup = () => {
        this.unregisterListener(connectListener);
        this.unregisterListener(errorListener);
        this._abortOpen = null;
        this._opening = null;
      };

      this._abortOpen = () => {
        const error = new OperationCanceled('client opening aborted');
        cleanup();
        this.socket.abortRequests(error);
        reject(error);
      };

      connectListener = this.registerListener('connect', () => { cleanup(); resolve(); });
      errorListener = this.registerListener('connect_error', (err) => {
        const error = new NetworkError(`can't connect socket: ${err && err.message} ${err && err.description && err.description.message}`);
        cleanup();
        this.socket.abortRequests(error);
        reject(error);
      });

      this.socket.open();
    });

    return this._opening;
  }

  async close(): Promise<void> {
    if (this._abortOpen) {
      this._abortOpen();
    }

    // purge socket event listeners
    await this.unregisterListeners();

    // purge authentication handler
    this._authenticator = null;
    this._authenticated = false;

    await this.socket.close();
  }

  async send(route: string, payload: any): Promise<any> {
    await this.open();
    await this._authenticate();
    return this._send(route, payload);
  }

  async _unauthenticatedSend(route: string, payload: any): Promise<any> {
    await this.open();
    return this._send(route, payload);
  }

  async _send(route: string, payload: any): Promise<any> {
    const jdata = route !== 'push block' ? JSON.stringify(payload) : payload;
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

  sendBlock = async (block: Block): Promise<void> => {
    const b2 = { index: 0, ...block };
    await this.send('push block', utils.toBase64(serializeBlock(b2)));
  }

  sendKeyPublishBlocks = async (blocks: Array<Block>): Promise<void> => {
    const serializedBlocks: Array<b64string> = [];
    blocks.forEach(block => {
      const b2 = { index: 0, ...block };
      serializedBlocks.push(utils.toBase64(serializeBlock(b2)));
    });

    await this.send('push keys', serializedBlocks);
  }

  getProvisionalUsers = async (provisionalIdentities: Array<PublicProvisionalIdentity>): Promise<Array<PublicProvisionalUser>> => {
    if (provisionalIdentities.length === 0)
      return [];

    const request = provisionalIdentities.map(provisionalIdentity => {
      if (provisionalIdentity.target !== 'email') {
        throw new InvalidArgument(`Unsupported provisional identity target: ${provisionalIdentity.target}`);
      }
      const email = generichash(utils.fromString(provisionalIdentity.value));
      return { type: 'email', hashed_email: email };
    });

    // Note: public keys are returned in an array matching the original order of provisional identities in the request
    const tankerPublicKeys = await this.send('get public provisional identities', b64RequestObject(request));

    return tankerPublicKeys.map((tpk, i) => ({
      trustchainId: utils.fromBase64(provisionalIdentities[i].trustchain_id),
      target: provisionalIdentities[i].target,
      value: provisionalIdentities[i].value,
      appEncryptionPublicKey: utils.fromBase64(provisionalIdentities[i].public_encryption_key),
      appSignaturePublicKey: utils.fromBase64(provisionalIdentities[i].public_signature_key),
      tankerEncryptionPublicKey: utils.fromBase64(tpk.encryption_public_key),
      tankerSignaturePublicKey: utils.fromBase64(tpk.signature_public_key),
    }));
  }
}
