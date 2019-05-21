// @flow

import EventEmitter from 'events';
import Socket from 'socket.io-client';
import { utils, type b64string } from '@tanker/crypto';
import { type PublicProvisionalIdentity, type PublicProvisionalUser } from '@tanker/identity';

import { type Block } from '../Blocks/Block';
import { serializeBlock } from '../Blocks/payloads';
import { ServerError, AuthenticationError } from '../errors';
import SocketIoWrapper, { type SdkInfo } from './SocketIoWrapper';

export type AuthDeviceParams = {
  signature: Uint8Array,
  publicSignatureKey: Uint8Array,
  trustchainId: Uint8Array,
  userId: Uint8Array,
}

export type DeviceCreatedCb = () => void;

const defaultApiAddress = 'https://api.tanker.io';

export type ClientOptions = {
  socket?: Socket,
  url?: string,
  sdkInfo: SdkInfo,
}

export function b64RequestObject(requestObject: any): any {
  const result = {};
  Object.entries(requestObject).forEach(elem => {
    if (elem[1] instanceof Uint8Array) {
      result[elem[0]] = utils.toBase64(elem[1]);
    } else if (Array.isArray(elem[1])) {
      result[elem[0]] = elem[1].map(b64RequestObject);
    } else if (elem[1] && typeof elem[1] === 'object') {
      result[elem[0]] = b64RequestObject(elem[1]);
    } else {
      result[elem[0]] = elem[1]; // eslint-disable-line prefer-destructuring
    }
  });
  return result;
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

  setAuthenticator = async (authenticator: Authenticator) => {
    if (this._authenticator)
      throw new Error('authenticator has already been set');

    this._authenticator = authenticator;
    return this.authenticate();
  }

  authenticate = async () => {
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
    const { challenge } = await this.send('request auth challenge');
    return challenge;
  }

  async authenticateDevice({ userId, trustchainId, publicSignatureKey, signature }: AuthDeviceParams) {
    const authDeviceRequest = {
      signature: utils.toBase64(signature),
      public_signature_key: utils.toBase64(publicSignatureKey),
      trustchain_id: utils.toBase64(trustchainId),
      user_id: utils.toBase64(userId),
    };

    try {
      return this.send('authenticate device', authDeviceRequest);
    } catch (e) {
      throw new AuthenticationError(e);
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

  async send(eventName: string, payload: any): Promise<any> {
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

    await this.send('subscribe to creation', {
      trustchain_id: utils.toBase64(this.trustchainId),
      public_signature_key: utils.toBase64(publicSignatureKey),
      signature: utils.toBase64(publicSignatureKeySignature),
    });
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

  getProvisionalIdentityPublicKeys = async (emails: Array<{ email: string }>): Promise<Array<*>> => {
    const result = await this.send('get public provisional identities', emails);
    if (result.error)
      throw new ServerError(result.error, this.trustchainId);

    return result.map(e => ({
      tankerSignaturePublicKey: utils.fromBase64(e.SignaturePublicKey),
      tankerEncryptionPublicKey: utils.fromBase64(e.EncryptionPublicKey),
    }));
  }

  getProvisionalUsers = async (provisionalIdentities: Array<PublicProvisionalIdentity>): Promise<Array<PublicProvisionalUser>> => {
    if (provisionalIdentities.length === 0)
      return [];

    const provisionalIds = provisionalIdentities.map(e => ({ [e.target]: e.value }));
    const tankerPublicKeys = await this.getProvisionalIdentityPublicKeys(provisionalIds);

    return tankerPublicKeys.map((e, i) => ({
      trustchainId: utils.fromBase64(provisionalIdentities[i].trustchain_id),
      target: provisionalIdentities[i].target,
      value: provisionalIdentities[i].value,
      ...e,
      appSignaturePublicKey: utils.fromBase64(provisionalIdentities[i].public_signature_key),
      appEncryptionPublicKey: utils.fromBase64(provisionalIdentities[i].public_encryption_key),
    }));
  }
}
