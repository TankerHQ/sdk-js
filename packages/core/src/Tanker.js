// @flow

import { utils, generichash, type b64string } from '@tanker/crypto';
import EventEmitter from 'events';
import { TextEncoder } from 'text-encoder';

import { type ClientOptions, type UnlockMethods } from './Network/Client';
import { type DataStoreOptions } from './Session/Storage';
import { getResourceId as syncGetResourceId } from './Resource/ResourceManager';

import { InvalidSessionStatus, InvalidArgument } from './errors';
import { type UnlockKey, type RegisterUnlockParams } from './Unlock/unlock';

import { extractUserData } from './UserData';
import { Session } from './Session/Session';
import { SessionOpener, type OpenMode, type SignInResult, type SignInOptions, SIGN_IN_RESULT, OPEN_MODE } from './Session/SessionOpener';
import { type EncryptionOptions, validateEncryptionOptions } from './DataProtection/EncryptionOptions';
import { type ShareWithOptions, isShareWithOptionsEmpty, validateShareWithOptions } from './DataProtection/ShareWithOptions';
import EncryptorStream from './DataProtection/EncryptorStream';
import DecryptorStream from './DataProtection/DecryptorStream';

import { TANKER_SDK_VERSION as version } from './version';

export type { SignInOptions, SignInResult } from './Session/SessionOpener';

const statusDefs = [
  /* 0 */ { name: 'CLOSED', description: 'tanker session is closed' },
  /* 1 */ { name: 'OPEN', description: 'tanker session is open' },
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
  sdkType?: string,
|};

export type TankerOptions = {|
  ...TankerDefaultOptions,
  trustchainId: b64string
|};

export type AuthenticationMethods = {|
  email?: string,
  password?: string,
|};

export function optionsWithDefaults(options: TankerOptions, defaults: TankerDefaultOptions) {
  if (!options || typeof options !== 'object' || options instanceof Array)
    throw new InvalidArgument('options', 'object', options);

  if (!defaults || typeof defaults !== 'object' || defaults instanceof Array)
    throw new InvalidArgument('defaults', 'object', defaults);

  const result = { ...defaults, ...options };

  // Deep merge dataStore option
  if ('dataStore' in defaults)
    result.dataStore = { ...defaults.dataStore, ...options.dataStore };

  return result;
}

export class Tanker extends EventEmitter {
  _session: Session;
  _sessionOpener: SessionOpener;
  _options: TankerOptions;
  _clientOptions: ClientOptions;
  _dataStoreOptions: DataStoreOptions;

  CLOSED: number = TankerStatus.CLOSED;
  OPEN: number = TankerStatus.OPEN;

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
    if (typeof options.sdkType !== 'string') {
      throw new InvalidArgument('options.sdkType', 'string', options.sdkType);
    }

    this._options = options;

    const clientOptions: ClientOptions = {
      sdkInfo: {
        version,
        type: options.sdkType,
        trustchainId: options.trustchainId
      }
    };
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
    }
    return this.CLOSED;
  }

  get statusName(): string {
    const def = statusDefs[this.status];
    return def ? def.name : `invalid status: ${this.status}`;
  }

  addListener(eventName: string, listener: any): any {
    return this.on(eventName, listener);
  }

  on(eventName: string, listener: any): any {
    return super.on(eventName, listener);
  }

  once(eventName: string, listener: any): any {
    return super.once(eventName, listener);
  }

  _setSessionOpener = (opener: ?SessionOpener) => {
    if (opener) {
      this._sessionOpener = opener;
      this._sessionOpener.on('unlockRequired', () => {
        this.emit('unlockRequired');
        this.emit('statusChange', this.status);
      });
    } else {
      delete this._sessionOpener;
    }
  }

  _setSession = (session: ?Session) => {
    if (session) {
      session.localUser.on('device_revoked', this._nuke);
      this._session = session;
      delete this._sessionOpener;
    } else {
      delete this._session;
      this.emit('sessionClosed');
    }
    this.emit('statusChange', this.status);
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

  async signUp(identityB64: b64string, authenticationMethods?: AuthenticationMethods): Promise<void> {
    await this._open(identityB64, OPEN_MODE.SIGN_UP);
    if (authenticationMethods) {
      await this.registerUnlock(authenticationMethods);
    }
  }

  async signIn(identityB64: b64string, signInOptions?: SignInOptions): Promise<SignInResult> {
    return this._open(identityB64, OPEN_MODE.SIGN_IN, signInOptions);
  }

  async _open(identityB64: b64string, openMode: OpenMode, signInOptions?: SignInOptions): Promise<SignInResult> {
    this.assert(this.CLOSED, 'open a session');
    // Type verif arguments
    if (!identityB64 || typeof identityB64 !== 'string')
      throw new InvalidArgument('identity', 'b64string', identityB64);
    // End type verif
    const userData = extractUserData(identityB64);

    if (this.trustchainId !== utils.toBase64(userData.trustchainId))
      throw new InvalidArgument('identity', 'b64string', identityB64);

    const sessionOpener = await SessionOpener.create(userData, this._dataStoreOptions, this._clientOptions);
    this._setSessionOpener(sessionOpener);

    const openResult = await this._sessionOpener.openSession(openMode, signInOptions);

    if (openResult.signInResult === SIGN_IN_RESULT.OK) {
      if (!openResult.session)
        throw new Error('Assertion error: Session should be opened');
      this._setSession(openResult.session);
    }

    return openResult.signInResult;
  }

  async signOut(): Promise<void> {
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
    return this._session.localUser.unlockMethods;
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

  async registerUnlock(params: RegisterUnlockParams): Promise<void> {
    this.assert(this.OPEN, 'register an unlock method');

    if (typeof params !== 'object' || params === null) {
      throw new InvalidArgument('register unlock options', 'should be an object', params);
    }

    if (Object.keys(params).some(k => k !== 'email' && k !== 'password')) {
      throw new InvalidArgument('register unlock options', 'should only contain an email and/or a password', params);
    }

    const { password, email } = params;

    if (!email && !password) {
      throw new InvalidArgument('register unlock options', 'should at least contain an email or a password key', params);
    }
    if (email && typeof email !== 'string') {
      throw new InvalidArgument('register unlock options', 'email should be a string', email);
    }
    if (password && typeof password !== 'string') {
      throw new InvalidArgument('register unlock options', 'password should be a string', password);
    }
    return this._session.unlockKeys.registerUnlock(password, email);
  }

  async getDeviceList(): Promise<Array<{id: string, isRevoked: bool}>> {
    this.assert(this.OPEN, 'get the device list');
    const allDevices = await this._session.userAccessor.findUserDevices({ userId: this._session.localUser.userId });
    return allDevices.filter(d => !d.isGhostDevice).map(d => ({ id: d.id, isRevoked: d.isRevoked }));
  }

  async isUnlockAlreadySetUp(): Promise<bool> {
    this.assert(this.OPEN, 'is unlock already setup');
    const devices = await this._session.userAccessor.findUserDevices({ userId: this._session.localUser.userId });
    return devices.some(device => device.isGhostDevice === true && device.isRevoked === false);
  }

  _parseEncryptionOptions = (options?: EncryptionOptions = {}): EncryptionOptions => {
    if (!validateEncryptionOptions(options))
      throw new InvalidArgument('options', '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<String> }', options);

    const opts = { shareWithSelf: true, ...options };

    if (opts.shareWithSelf === false && isShareWithOptionsEmpty(options))
      throw new InvalidArgument('options.shareWith*', 'options.shareWithUsers or options.shareWithGroups must contain recipients when options.shareWithSelf === false', opts);

    return opts;
  }

  async share(resourceIds: Array<b64string>, shareWithOptions: ShareWithOptions): Promise<void> {
    this.assert(this.OPEN, 'share');

    if (!(resourceIds instanceof Array))
      throw new InvalidArgument('resourceIds', 'Array<b64string>', resourceIds);

    if (!validateShareWithOptions(shareWithOptions))
      throw new InvalidArgument('shareWithOptions', '{ shareWithUsers: Array<b64string>, shareWithGroups: Array<string> }', shareWithOptions);

    return this._session.dataProtector.share(resourceIds, shareWithOptions);
  }

  async getResourceId(encryptedData: Uint8Array): Promise<b64string> {
    if (!(encryptedData instanceof Uint8Array))
      throw new InvalidArgument('encryptedData', 'Uint8Array', encryptedData);

    return utils.toBase64(syncGetResourceId(encryptedData));
  }

  async revokeDevice(deviceId: b64string): Promise<void> {
    this.assert(this.OPEN, 'revoke a device');

    if (typeof deviceId !== 'string')
      throw new InvalidArgument('deviceId', 'string', deviceId);
    return this._session.revokeDevice(deviceId);
  }

  async createGroup(users: Array<b64string>): Promise<b64string> {
    this.assert(this.OPEN, 'create a group');

    if (!(users instanceof Array))
      throw new InvalidArgument('users', 'Array<string>', users);

    return this._session.groupManager.createGroup(users);
  }

  async updateGroupMembers(groupId: string, { usersToAdd }: {| usersToAdd?: Array<b64string> |}): Promise<void> {
    this.assert(this.OPEN, 'update a group');

    if (!usersToAdd || !(usersToAdd instanceof Array))
      throw new InvalidArgument('usersToAdd', 'Array<string>', usersToAdd);

    if (typeof groupId !== 'string')
      throw new InvalidArgument('groupId', 'string', groupId);

    return this._session.groupManager.updateGroupMembers(groupId, usersToAdd);
  }

  async provisionalIdentityClaim(provisionalIdentity: { email: string }, verificationCode: string, appInvitePrivateSignatureKey: string, appInvitePrivateEncryptionKey: string): Promise<void> {
    this.assert(this.OPEN, 'claim invite');

    return this._session.dataProtector.provisionalIdentityClaim(provisionalIdentity, verificationCode, utils.fromBase64(appInvitePrivateSignatureKey), utils.fromBase64(appInvitePrivateEncryptionKey));
  }

  // FIXME: This function is only intended for internal tests, will not work in production.
  // Remove me!
  async _getClaimVerificationCode(email: string): Promise<b64string> {
    const testSecretKey = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35]); // Secure AF 👌
    const emailBuf = new TextEncoder().encode(email);
    const prefix = new Uint8Array([0x74, 0x61, 0x6e, 0x6b, 0x65, 0x72, 0x20, 0x69, 0x6e, 0x76, 0x69, 0x74,
      0x65, 0x65, 0x20, 0x76, 0x65, 0x72, 0x69, 0x66, 0x69, 0x63, 0x61, 0x74,
      0x69, 0x6f, 0x6e, 0x20, 0x63, 0x6f, 0x64, 0x65]);
    let toHash = utils.concatArrays(prefix, testSecretKey);
    toHash = utils.concatArrays(toHash, utils.fromBase64(this._options.trustchainId));
    toHash = utils.concatArrays(toHash, emailBuf);
    return utils.toBase64(generichash(toHash));
  }

  async makeEncryptorStream(options?: EncryptionOptions): Promise<EncryptorStream> {
    this.assert(this.OPEN, 'make a stream encryptor');

    const opts = this._parseEncryptionOptions(options);

    return this._session.dataProtector.makeEncryptorStream(opts);
  }

  async makeDecryptorStream(): Promise<DecryptorStream> {
    this.assert(this.OPEN, 'make a stream decryptor');

    return this._session.dataProtector.makeDecryptorStream();
  }
}

export default Tanker;
