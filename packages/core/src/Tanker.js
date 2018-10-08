// @flow

import { utils, type b64string } from '@tanker/crypto';
import EventEmitter from 'events';

import { type ClientOptions, type UnlockMethods } from './Network/Client';
import { type DataStoreOptions } from './Session/Storage';
import { getResourceId as egetResourceId, type EncryptionOptions } from './Encryption/Encryptor';
import ChunkEncryptor, { makeChunkEncryptor } from './Encryption/ChunkEncryptor';
import { InvalidSessionStatus, InvalidArgument } from './errors';
import { type UnlockKey, type UnlockDeviceParams, type SetupUnlockParams } from './Unlock/unlock';

import { extractUserData } from './Tokens/SessionTypes';
import { Session, SessionOpener } from './Session/Session';

const statusDefs = [
  /* 0 */ { name: 'CLOSED', description: 'tanker session is closed' },
  /* 1 */ { name: 'OPEN', description: 'tanker session is open' },
  /* 2 */ { name: 'OPENING', description: 'opening tanker session' },
  /* 3 */ { name: 'USER_CREATION', description: 'new tanker user registration: waiting for finalizeUserCreation to be called' },
  /* 4 */ { name: 'UNLOCK_REQUIRED', description: 'new tanker device registration: the device needs to be unlocked' },
  /* 5 */ { name: 'CLOSING', description: 'closing tanker session' },
];

export const TankerStatus: { [name: string]: number } = (() => {
  const h = {};
  statusDefs.forEach((def, value) => {
    h[def.name] = value;
  });
  return h;
})();

type TankerDefaultOptions = {|
  trustchainId?: b64string,
  socket?: any,
  url?: string,
  dataStore?: { adapter: Function, prefix?: string, dbPath?: string, url?: string },
|};

export type TankerOptions = {|
  ...TankerDefaultOptions,
  trustchainId: b64string,
|};

export function getResourceId(data: Uint8Array): b64string {
  console.warn('\'getResourceId\' util function is deprecated since version 1.7.2, use the method on a Tanker instance instead, e.g. tanker.getResourceId(...)');

  if (!(data instanceof Uint8Array))
    throw new InvalidArgument('data', 'Uint8Array', data);

  return utils.toBase64(egetResourceId(data));
}

export class Tanker extends EventEmitter {
  _session: Session;
  _sessionOpener: SessionOpener;
  _options: TankerOptions;
  _clientOptions: ClientOptions;
  _dataStoreOptions: DataStoreOptions;

  CLOSED: number = TankerStatus.CLOSED;
  CLOSING: number = TankerStatus.CLOSING;
  OPEN: number = TankerStatus.OPEN;
  OPENING: number = TankerStatus.OPENING;
  USER_CREATION: number = TankerStatus.USER_CREATION;
  UNLOCK_REQUIRED: number = TankerStatus.UNLOCK_REQUIRED;

  get DEVICE_CREATION(): number {
    console.warn('Property `DEVICE_CREATION` has been deprecated since version 1.7.0, use `UNLOCK_REQUIRED` instead.');
    return this.UNLOCK_REQUIRED;
  }

  // Inspired by PouchDB.defaults(), see:
  // https://github.com/pouchdb/pouchdb/blob/e35f949/packages/node_modules/pouchdb-core/src/setup.js#L92
  static defaults(defaultOptions: TankerDefaultOptions) {
    // Anonymous class that remembers the default options
    return class extends this {
      constructor(options: TankerOptions) {
        const optionsWithDefaults = { ...defaultOptions, ...options };

        // Deep merge dataStore option
        optionsWithDefaults.dataStore = { ...defaultOptions.dataStore, ...options.dataStore };

        super(optionsWithDefaults);
      }
    };
  }

  constructor(options: TankerOptions) {
    super();

    if (!options || typeof options !== 'object' || options instanceof Array) {
      throw new InvalidArgument('options', 'object', options);
    }

    if (typeof options.trustchainId !== 'string') {
      throw new InvalidArgument('options.trustchainId', 'string', options.trustchainId);
    }

    if (typeof options.dataStore !== 'object' || options.dataStore instanceof Array) {
      throw new InvalidArgument('options.dataStore', 'object', options.dataStore);
    } else if (typeof options.dataStore.adapter !== 'function') {
      // $FlowFixMe
      throw new InvalidArgument('options.dataStore.adapter', 'function', options.dataStore.adapter);
    }

    this._options = options;

    const clientOptions: ClientOptions = {};
    if (options.socket) { clientOptions.socket = options.socket; }
    if (options.url) { clientOptions.url = options.url; }
    this._clientOptions = clientOptions;

    const datastoreOptions: DataStoreOptions = {
      adapter: options.dataStore.adapter
    };
    if (options.dataStore.prefix) { datastoreOptions.prefix = options.dataStore.prefix; }
    if (options.dataStore.dbPath) { datastoreOptions.dbPath = options.dataStore.dbPath; }
    if (options.dataStore.url) { datastoreOptions.url = options.dataStore.url; }
    this._dataStoreOptions = datastoreOptions;

    /* eslint-disable no-underscore-dangle */
    if (typeof window !== 'undefined' && window.__TANKER_DEVTOOLS_GLOBAL_HOOK__) {
      window.__TANKER_DEVTOOLS_GLOBAL_HOOK__.registerTanker(this);
    }
  }

  get trustchainId(): b64string {
    return this._options.trustchainId;
  }

  get options(): TankerOptions {
    return this._options;
  }

  get status(): number {
    if (this._session) {
      return this.OPEN;
    } else if (this._sessionOpener) {
      return this.UNLOCK_REQUIRED;
    }
    return this.CLOSED;
  }

  get statusName(): string {
    const def = statusDefs[this.status];
    return def ? def.name : `invalid status: ${this.status}`;
  }

  get statusDescription(): string {
    const def = statusDefs[this.status];
    return def ? def.description : `invalid status: ${this.status}`;
  }

  addListener(eventName: string, listener: any): any {
    return this.on(eventName, listener);
  }

  on(eventName: string, listener: any): any {
    if (eventName === 'waitingForValidation') {
      console.warn('\'waitingForValidation\' event has been deprecated since version 1.7.0, please use \'unlockRequired\' instead.');
    }
    return super.on(eventName, listener);
  }

  once(eventName: string, listener: any): any {
    if (eventName === 'waitingForValidation') {
      console.warn('\'waitingForValidation\' event has been deprecated since version 1.7.0, please use \'unlockRequired\' instead.');
    }
    return super.once(eventName, listener);
  }

  _setSessionOpener = (opener: ?SessionOpener) => {
    if (opener) {
      this._sessionOpener = opener;
      this._sessionOpener.on('unlockRequired', () => {
        const validationCode = this.deviceValidationCode();
        this.emit('unlockRequired');
        this.emit('waitingForValidation', validationCode);
      });
    } else {
      delete this._sessionOpener;
    }
    this.emit('statusChange', this.status);
  }

  _setSession = (session: ?Session) => {
    if (session) {
      session.storage.keyStore.on('device_revoked', this._nuke);
      this._session = session;
      delete this._sessionOpener;
    } else {
      delete this._session;
      this.emit('sessionClosed');
    }
    this.emit('statusChange', this.status);
  }

  deviceValidationCode(): b64string {
    this.assert(this.UNLOCK_REQUIRED, 'generate a device validation code');
    return this._sessionOpener.unlocker.deviceValidationCode();
  }

  get deviceId(): b64string {
    if (!this._session.storage.keyStore || !this._session.storage.keyStore.deviceId)
      throw new Error('Tried to get our device hash, but could not find it!');

    return utils.toBase64(this._session.storage.keyStore.deviceId);
  }

  assert(status: number, to: string): void {
    if (this.status !== status) {
      const { name } = statusDefs[status];
      const message = `Expected status ${name} but got ${this.statusName} trying to ${to}.`;
      throw new InvalidSessionStatus(this.status, message);
    }
  }

  isOpen(): bool {
    return this.status === this.OPEN;
  }

  async open(userIdString: string, sessionTokenB64: b64string, oldDelegationToken: *): Promise<number> {
    this.assert(this.CLOSED, 'open a session');
    // Type verif arguments
    if (oldDelegationToken)
      throw new Error('open does not take a delegation token anymore, see https://tanker.io/docs/latest/changelog/#new_open_workflow_breaking_change');
    if (!userIdString || typeof userIdString !== 'string')
      throw new InvalidArgument('userId', 'string', userIdString);
    if (!sessionTokenB64 || typeof sessionTokenB64 !== 'string')
      throw new InvalidArgument('userToken', 'b64string', sessionTokenB64);
    // End type verif
    const userData = extractUserData(utils.fromBase64(this.trustchainId), userIdString, sessionTokenB64);
    const sessionOpener = await SessionOpener.create(userData, this._dataStoreOptions, this._clientOptions);
    this._setSessionOpener(sessionOpener);

    const allowedToUnlock = !(this.listenerCount('unlockRequired') === 0
      && this.listenerCount('waitingForValidation') === 0);

    const session = await this._sessionOpener.openSession(allowedToUnlock);
    this._setSession(session);
    return this.OPEN;
  }

  async close(): Promise<void> {
    const sessionOpener = this._sessionOpener;
    this._setSessionOpener(null);

    const session = this._session;
    this._setSession(null);

    if (session) {
      await session.close();
    }
    if (sessionOpener) {
      await sessionOpener.cancel();
    }
  }

  _nuke = async (): Promise<void> => {
    const session = this._session;
    this._setSession(null);
    if (session) {
      await session.nuke();
    }
    this.emit('revoked');
  }

  get registeredUnlockMethods(): UnlockMethods {
    this.assert(this.OPEN, 'has registered unlock methods');
    return this._session.sessionData.unlockMethods;
  }

  hasRegisteredUnlockMethods(): bool {
    this.assert(this.OPEN, 'has registered unlock methods');
    return this.registeredUnlockMethods.length !== 0;
  }

  hasRegisteredUnlockMethod(method: "password" | "email"): bool {
    this.assert(this.OPEN, 'has registered unlock method');
    if (['password', 'email'].indexOf(method) === -1) {
      throw new InvalidArgument('method', 'password or email', method);
    }
    return this.registeredUnlockMethods.some(item => method === item.type);
  }

  async generateAndRegisterUnlockKey(): Promise<UnlockKey> {
    this.assert(this.OPEN, 'generate an unlock key');
    return this._session.unlockKeys.generateAndRegisterUnlockKey();
  }

  async acceptDevice(validationCode: b64string): Promise<void> {
    this.assert(this.OPEN, 'accept a device');
    return this._session.unlockKeys.acceptDevice(validationCode);
  }

  async updateUnlock({ password, email, unlockKey }: {| ...SetupUnlockParams, unlockKey?: UnlockKey |}): Promise<void> {
    this.assert(this.OPEN, 'update an unlock key');
    if (!password && !email && !unlockKey) {
      throw new InvalidArgument('update unlock options', 'should at least use one option', { email, password, unlockKey });
    }
    if (email && typeof email !== 'string') {
      throw new InvalidArgument('setup unlock options', 'email should be a string', email);
    }
    if (password && typeof password !== 'string') {
      throw new InvalidArgument('setup unlock options', 'password should be a string', password);
    }
    if (unlockKey && typeof unlockKey !== 'string') {
      throw new InvalidArgument('setup unlock options', 'unlock key should be a base64 string', unlockKey);
    }
    return this._session.unlockKeys.updateUnlock(password, email, unlockKey);
  }

  async setupUnlock({ password, email }: SetupUnlockParams): Promise<void> {
    this.assert(this.OPEN, 'setup an unlock key');
    if (!password && !email) {
      throw new InvalidArgument('setup unlock options', 'should at least use one option', { email, password });
    }
    if (email && typeof email !== 'string') {
      throw new InvalidArgument('setup unlock options', 'email should be a string', email);
    }
    if (password && typeof password !== 'string') {
      throw new InvalidArgument('setup unlock options', 'password should be a string', password);
    }
    return this._session.unlockKeys.setupUnlock(password, email);
  }

  async unlockCurrentDevice(value: UnlockDeviceParams): Promise<void> {
    this.assert(this.UNLOCK_REQUIRED, 'unlock a device');
    if (!value) {
      throw new InvalidArgument('unlock options', 'object', value);
    } else if (typeof value === 'string') {
      console.warn('unlockCurrentDevice(unlockKey) has been deprecated, pass a dictionary instead');
      return this.unlockCurrentDevice({ unlockKey: value });
    } else if (Object.keys(value).length !== 1) {
      throw new InvalidArgument('unlock options', 'object', value);
    }
    const { unlockKey, password, verificationCode } = value;
    if (unlockKey) {
      return this._sessionOpener.unlocker.unlockWithUnlockKey(unlockKey);
    } else if (password || verificationCode) {
      return this._sessionOpener.unlocker.unlockWithPassword(password, verificationCode);
    } else {
      throw new InvalidArgument('unlock options', 'object', value);
    }
  }

  async getDeviceList(): Promise<Array<{id: string, isRevoked: bool}>> {
    this.assert(this.OPEN, 'get the device list');
    const allDevices = await this._session.userAccessor.findUserDevices({ hashedUserId: this._session.sessionData.userId });
    return allDevices.filter(d => !d.isGhostDevice).map(d => ({ id: d.id, isRevoked: d.isRevoked }));
  }

  async isUnlockAlreadySetUp(): Promise<bool> {
    this.assert(this.OPEN, 'is unlock already setup');
    const devices = await this._session.userAccessor.findUserDevices({ hashedUserId: this._session.sessionData.userId });
    return devices.some(device => device.isGhostDevice === true && device.isRevoked === false);
  }

  async encryptData(plain: Uint8Array, options?: EncryptionOptions): Promise<Uint8Array> {
    this.assert(this.OPEN, 'encrypt data');

    if (!(plain instanceof Uint8Array))
      throw new InvalidArgument('plain', 'Uint8Array', plain);

    return this._session.encryptor.encryptData(plain, options);
  }

  async encrypt(plain: string, options?: EncryptionOptions): Promise<Uint8Array> {
    this.assert(this.OPEN, 'encrypt');

    if (typeof plain !== 'string')
      throw new InvalidArgument('plain', 'string', plain);

    return this.encryptData(utils.fromString(plain), options);
  }

  async decryptData(cipher: Uint8Array): Promise<Uint8Array> {
    this.assert(this.OPEN, 'decrypt data');

    if (!(cipher instanceof Uint8Array))
      throw new InvalidArgument('cipher', 'Uint8Array', cipher);

    return this._session.encryptor.decryptData(cipher);
  }

  async decrypt(cipher: Uint8Array): Promise<string> {
    return utils.toString(await this.decryptData(cipher));
  }

  async share(resourceIds: Array<b64string>, shareWith: Array<string>): Promise<void> {
    this.assert(this.OPEN, 'share');

    if (!(resourceIds instanceof Array))
      throw new InvalidArgument('resourceIds', 'Array<b64string>', resourceIds);

    if (!(shareWith instanceof Array))
      throw new InvalidArgument('shareWith', 'Array<string>', shareWith);

    return this._session.encryptor.share(resourceIds, shareWith);
  }

  getResourceId(data: Uint8Array): b64string {
    if (!(data instanceof Uint8Array))
      throw new InvalidArgument('data', 'Uint8Array', data);

    return utils.toBase64(egetResourceId(data));
  }

  async makeChunkEncryptor(seal?: Uint8Array): Promise<ChunkEncryptor> {
    this.assert(this.OPEN, 'make a chunk encryptor');
    return makeChunkEncryptor(this._session.encryptor, seal);
  }

  async revokeDevice(deviceId: b64string): Promise<void> {
    this.assert(this.OPEN, 'revoke a device');

    if (typeof deviceId !== 'string')
      throw new InvalidArgument('deviceId', 'string', deviceId);
    return this._session.revokeDevice(deviceId);
  }

  async createGroup(users: Array<string>): Promise<b64string> {
    this.assert(this.OPEN, 'create a group');

    if (!(users instanceof Array))
      throw new InvalidArgument('users', 'Array<string>', users);

    return this._session.groupManager.createGroup(users);
  }

  async updateGroupMembers(groupId: string, { usersToAdd }: {| usersToAdd?: Array<string> |}): Promise<void> {
    this.assert(this.OPEN, 'update a group');

    if (!usersToAdd || !(usersToAdd instanceof Array))
      throw new InvalidArgument('usersToAdd', 'Array<string>', usersToAdd);

    if (typeof groupId !== 'string')
      throw new InvalidArgument('groupId', 'string', groupId);

    return this._session.groupManager.updateGroupMembers(groupId, usersToAdd);
  }
}

export default Tanker;
