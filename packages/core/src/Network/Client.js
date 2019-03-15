// @flow

import EventEmitter from 'events';
import Socket from 'socket.io-client';
import { utils, type b64string, type Key } from '@tanker/crypto';

import { type Block } from '../Blocks/Block';
import { serializeBlock } from '../Blocks/payloads';
import { ServerError, AuthenticationError } from '../errors';
import SocketIoWrapper, { type SdkInfo } from './SocketIoWrapper';
import { UnlockKeyAnswer, type UnlockKeyMessage, type UnlockClaims, type UnlockKeyRequest } from '../Unlock/unlock';

export type AuthDeviceParams = {
  signature: Uint8Array,
  publicSignatureKey: Uint8Array,
  trustchainId: Uint8Array,
  userId: Uint8Array,
}

export type UnlockMethod = {
  type: "password" | "email"
}

export type UnlockMethods = Array<UnlockMethod>

export type DeviceCreatedCb = () => void;

const defaultApiAddress = 'https://api.tanker.io';

export type ClientOptions = {
  socket?: Socket,
  url?: string,
  sdkInfo: SdkInfo,
}

/**
 * Our public and private user key encrypted for this device
 */
export type EncryptedUserKey = {
  public_user_key: Key,
  encrypted_private_user_key: Uint8Array,
}

// We force the translation of the wire object, to protect the public API
function toUnlockMethods(deviceAuthResponse: Object): UnlockMethods {
  let ret: UnlockMethods = [];
  if (!deviceAuthResponse || !deviceAuthResponse.unlock_methods)
    return ret;
  ret = deviceAuthResponse.unlock_methods.map(item => ({ type: item.type }));
  return ret;
}

export type Authenticator = (string) => AuthDeviceParams;

/**
 * Network communication
 */
export class Client extends EventEmitter {
  socket: SocketIoWrapper;
  trustchainId: Uint8Array;
  sessionConnections: Set<number>;
  _authenticator: ?Authenticator;
  _socketCreator: () => void;
  _abortOpen: ?() => void;

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

    // The 'connect' event is received after first connection and
    // after each reconnection (after the 'reconnect' event).
    this.registerListener('reconnect', async () => {
      if (this._authenticator)
        /* noawait */ this.authenticate();
    });
    this.registerListener('new relevant block', () => {
      this.emit('blockAvailable');
    });
  }

  setAuthenticator = async (authenticator: Authenticator): Promise<UnlockMethods> => {
    if (this._authenticator)
      throw new Error('authenticator has already been set');

    this._authenticator = authenticator;
    return this.authenticate();
  }

  authenticate = async (): Promise<UnlockMethods> => {
    const authenticator = this._authenticator;
    if (!authenticator)
      throw new Error('no authenticator has been set');
    const challenge = await this.requestAuthChallenge();
    return this.authenticateDevice(authenticator(challenge));
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

  async requestAuthChallenge(): Promise<string> {
    const { challenge } = await this._send('request auth challenge');
    return challenge;
  }

  async authenticateDevice({ userId, trustchainId, publicSignatureKey, signature }: AuthDeviceParams): Promise<UnlockMethods> {
    const authDeviceRequest = {
      signature: utils.toBase64(signature),
      public_signature_key: utils.toBase64(publicSignatureKey),
      trustchain_id: utils.toBase64(trustchainId),
      user_id: utils.toBase64(userId),
    };

    try {
      const result = await this._send('authenticate device', authDeviceRequest);
      return toUnlockMethods(result);
    } catch (e) {
      throw new AuthenticationError(e);
    }
  }

  async userExists(trustchainId: Uint8Array, userId: Uint8Array, publicSignatureKey: Uint8Array) {
    const request = {
      trustchain_id: utils.toBase64(trustchainId),
      user_id: utils.toBase64(userId),
      device_public_signature_key: utils.toBase64(publicSignatureKey),
    };

    const reply = await this._send('get user status', request);

    return reply.user_exists === true;
  }

  async getLastUserKey(trustchainId: Uint8Array, deviceId: b64string): Promise<?EncryptedUserKey> {
    const request = {
      trustchain_id: utils.toBase64(trustchainId),
      device_id: deviceId,
    };

    const reply = await this._send('last user key', request);

    if (!reply.public_user_key || !reply.encrypted_private_user_key)
      return;

    return {
      public_user_key: utils.fromBase64(reply.public_user_key),
      encrypted_private_user_key: utils.fromBase64(reply.encrypted_private_user_key),
    };
  }

  async fetchUnlockKey(request: UnlockKeyRequest): Promise<UnlockKeyAnswer> {
    const req = {
      trustchain_id: utils.toBase64(request.trustchainId),
      user_id: utils.toBase64(request.userId),
      type: request.type,
      value: utils.toBase64(request.value),
    };
    const reply = await this._send('get unlock key', req);
    return new UnlockKeyAnswer(utils.fromBase64(reply.encrypted_unlock_key));
  }

  makeClaims({ password, unlockKey, email }: UnlockClaims): Object {
    const claims = {};
    if (email)
      claims.email = utils.toBase64(email);
    if (password)
      claims.password = utils.toBase64(password);
    if (unlockKey)
      claims.unlock_key = utils.toBase64(unlockKey);
    return claims;
  }

  makeUnlockRequest(message: UnlockKeyMessage): Object {
    const request = {
      trustchain_id: message.trustchainId,
      device_id: message.deviceId,
      claims: this.makeClaims(message.claims),
      signature: utils.toBase64(message.signature),
    };
    return request;
  }

  async createUnlockKey(message: UnlockKeyMessage): Promise<void> {
    await this._send('create unlock key', this.makeUnlockRequest(message));
  }

  async updateUnlockKey(message: UnlockKeyMessage): Promise<void> {
    await this._send('update unlock key', this.makeUnlockRequest(message));
  }

  async open(): Promise<void> {
    if (this._abortOpen) {
      throw new Error('open already in progress');
    }
    return new Promise((resolve, reject) => {
      let connectListener;
      let errorListener;

      const cleanup = () => {
        this.unregisterListener(connectListener);
        this.unregisterListener(errorListener);
        this._abortOpen = null;
      };

      this._abortOpen = () => { cleanup(); reject(new Error('aborted')); };

      connectListener = this.registerListener('connect', () => { cleanup(); resolve(); });
      errorListener = this.registerListener('connect_error', (e) => { cleanup(); reject(e); });

      this.socket.open();
    });
  }

  async close(): Promise<void> {
    if (this._abortOpen) {
      this._abortOpen();
    }

    // purge socket event listeners
    await this.unregisterListeners();

    // purge authentication handler
    this._authenticator = null;

    await this.socket.close();
  }

  async _send(eventName: string, payload: any): Promise<any> {
    const jdata = eventName !== 'push block' ? JSON.stringify(payload) : payload;

    const jresult = await this.socket.emit(eventName, jdata);
    const result = JSON.parse(jresult);
    if (result && result.error) {
      throw new ServerError(result.error, this.trustchainId);
    }
    return result;
  }

  async subscribeToCreation(publicSignatureKey: Uint8Array, publicSignatureKeySignature: Uint8Array, deviceCreatedCb: DeviceCreatedCb) {
    const listenerId = this.registerListener('device created', () => {
      this.unregisterListener(listenerId);
      deviceCreatedCb();
    });

    await this._send('subscribe to creation', {
      trustchain_id: utils.toBase64(this.trustchainId),
      public_signature_key: utils.toBase64(publicSignatureKey),
      signature: utils.toBase64(publicSignatureKeySignature),
    });
  }

  sendBlock = async (block: Block): Promise<void> => {
    const b2 = { index: 0, ...block };
    await this._send('push block', utils.toBase64(serializeBlock(b2)));
  }

  sendKeyPublishBlocks = async (blocks: Array<Block>): Promise<void> => {
    const serializedBlocks: Array<b64string> = [];
    blocks.forEach(block => {
      const b2 = { index: 0, ...block };
      serializedBlocks.push(utils.toBase64(serializeBlock(b2)));
    });

    await this._send('push keys', serializedBlocks);
  }

  getProvisionalIdentityKeys = async (emails: Array<{ email: string }>): Promise<*> => {
    const result = await this._send('get public provisional identities', emails);
    if (result.error)
      throw new ServerError(result.error, this.trustchainId);

    return result.map(e => ({
      tankerSignaturePublicKey: utils.fromBase64(e.SignaturePublicKey),
      tankerEncryptionPublicKey: utils.fromBase64(e.EncryptionPublicKey),
    }));
  }

  getProvisionalIdentityPrivateKeys = async (provisionalIdentity: { email: string }, verificationCode: string): Promise<*> => {
    const result = await this._send('get provisional identity', {
      email: provisionalIdentity.email,
      verificationCode,
    });
    if (result.error)
      throw new ServerError(result.error, this.trustchainId);

    return {
      tankerSignatureKeyPair: {
        privateKey: utils.fromBase64(result.SignaturePrivateKey),
        publicKey: utils.fromBase64(result.SignaturePublicKey),
      },
      tankerEncryptionKeyPair: {
        privateKey: utils.fromBase64(result.EncryptionPrivateKey),
        publicKey: utils.fromBase64(result.EncryptionPublicKey),
      }
    };
  }
}
