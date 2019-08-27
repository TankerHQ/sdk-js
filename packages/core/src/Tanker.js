// @flow

import { utils, type b64string } from '@tanker/crypto';
import { assertDataType, castData } from '@tanker/types';
import type { Data } from '@tanker/types';
import { _deserializeProvisionalIdentity } from '@tanker/identity';
import EventEmitter from 'events';

import { type ClientOptions } from './Network/Client';
import { type DataStoreOptions } from './Session/Storage';
import { extractResourceId } from './DataProtection/Encryptor';

import { DecryptionFailed, InternalError, InvalidArgument, PreconditionFailed } from './errors';
import { statusDefs, statuses, type Status, type Verification, type EmailVerification, type RemoteVerification, type VerificationMethod, assertVerification } from './Session/types';

import { extractUserData } from './Session/UserData';
import { Session } from './Session/Session';
import type { OutputOptions, SharingOptions } from './DataProtection/options';

import { defaultDownloadType, extractOutputOptions, extractSharingOptions, isObject, isSharingOptionsEmpty } from './DataProtection/options';
import type { Streams } from './DataProtection/DataProtector';
import EncryptorStream from './DataProtection/EncryptorStream';
import DecryptorStream from './DataProtection/DecryptorStream';

import { TANKER_SDK_VERSION } from './version';

// The maximum byte size of a resource encrypted with the "simple" algorithms
// (different from v4) is obtained by summing the sizes of:
//  - the version: 1 byte (varint < 128)
//  - the MAC: 16 bytes
//  - the IV: 24 bytes
//  - the data: 5 megabytes (libsodium's hard limit)
//
// By reading an input up to this size, we're sure to be able to extract the resource ID.
const SAFE_RESOURCE_ID_EXTRACTION = 1 + 16 + 24 + 5 * (1024 * 1024);

type TankerDefaultOptions = $Exact<{
  trustchainId?: b64string,
  socket?: any,
  url?: string,
  dataStore: DataStoreOptions,
  sdkType: string,
  streams: Streams,
}>;

type TankerCoreOptions = $Exact<{
  trustchainId: b64string,
  socket?: any,
  url?: string,
  dataStore: DataStoreOptions,
  sdkType: string,
  streams: Streams,
}>;

export type TankerOptions = $Exact<{
  trustchainId: b64string,
  socket?: any,
  url?: string,
  dataStore?: DataStoreOptions,
  sdkType?: string,
}>;

export function optionsWithDefaults(options: TankerOptions, defaults: TankerDefaultOptions): TankerCoreOptions {
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
  _options: TankerCoreOptions;
  _clientOptions: ClientOptions;
  _dataStoreOptions: DataStoreOptions;
  _streams: Streams;

  static version = TANKER_SDK_VERSION;
  static statuses = statuses;

  constructor(options: TankerCoreOptions) {
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
      throw new InvalidArgument('options.dataStore.adapter', 'function', options.dataStore.adapter);
    }
    if (typeof options.sdkType !== 'string') {
      throw new InvalidArgument('options.sdkType', 'string', options.sdkType);
    }

    this._options = options;

    this._streams = options.streams;

    const clientOptions: ClientOptions = {
      sdkInfo: {
        version: Tanker.version,
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

  get options(): TankerCoreOptions {
    return this._options;
  }

  get status(): Status {
    if (!this._session) {
      return statuses.STOPPED;
    }
    return this._session.status;
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

  _setSession = (session: ?Session) => {
    if (session) {
      session.on('device_revoked', this._nuke);
      session.on('authentication_failed', this.stop);
      this._session = session;
    } else {
      delete this._session;
      this.emit('sessionClosed');
    }
    this.emit('statusChange', this.status);
  }

  get deviceId(): b64string {
    this.assert(statuses.READY, 'get the device id');
    if (!this._session.storage.keyStore || !this._session.storage.keyStore.deviceId)
      throw new InternalError('Tried to get our device hash, but could not find it!');

    return utils.toBase64(this._session.storage.keyStore.deviceId);
  }

  assert(status: number, to: string): void {
    if (this.status !== status) {
      const { name } = statusDefs[status];
      const message = `Expected status ${name} but got ${this.statusName} trying to ${to}.`;
      throw new PreconditionFailed(message);
    }
  }

  async start(identityB64: b64string) {
    this.assert(statuses.STOPPED, 'start a session');
    const userData = this._parseIdentity(identityB64);

    const session = await Session.init(userData, this._dataStoreOptions, this._clientOptions, this._streams);
    this._setSession(session);
    return this.status;
  }

  async registerIdentity(verification: Verification): Promise<void> {
    this.assert(statuses.IDENTITY_REGISTRATION_NEEDED, 'register an identity');
    assertVerification(verification);
    await this._session.createUser(verification);
    this.emit('statusChange', this.status);
  }

  async verifyIdentity(verification: Verification): Promise<void> {
    this.assert(statuses.IDENTITY_VERIFICATION_NEEDED, 'verify an identity');
    assertVerification(verification);
    await this._session.unlockUser(verification);
    this.emit('statusChange', this.status);
  }

  async setVerificationMethod(verification: RemoteVerification): Promise<void> {
    this.assert(statuses.READY, 'set a verification method');

    assertVerification(verification);
    if ('verificationKey' in verification)
      throw new InvalidArgument('verification', 'cannot update a verification key', verification);

    return this._session.setVerificationMethod(verification);
  }

  async getVerificationMethods(): Promise<Array<VerificationMethod>> {
    // Note: sadly this.assert() does not assert "one in a list"
    if ([statuses.READY, statuses.IDENTITY_VERIFICATION_NEEDED].indexOf(this.status) === -1) {
      const { name: ready } = statusDefs[statuses.READY];
      const { name: verification } = statusDefs[statuses.IDENTITY_VERIFICATION_NEEDED];
      const message = `Expected status ${ready} or ${verification} but got ${this.statusName} trying to get verification methods.`;
      throw new PreconditionFailed(message);
    }

    return this._session.getVerificationMethods();
  }

  async generateVerificationKey(): Promise<string> {
    this.assert(statuses.IDENTITY_REGISTRATION_NEEDED, 'generate a verification key');
    return this._session.generateVerificationKey();
  }

  async attachProvisionalIdentity(provisionalIdentity: b64string): Promise<*> {
    this.assert(statuses.READY, 'attach a provisional identity');

    const provisionalIdentityObj = _deserializeProvisionalIdentity(provisionalIdentity);

    return this._session.apis.deviceManager.attachProvisionalIdentity(provisionalIdentityObj);
  }

  async verifyProvisionalIdentity(verification: EmailVerification): Promise<void> {
    this.assert(statuses.READY, 'verify a provisional identity');
    assertVerification(verification);
    return this._session.apis.deviceManager.verifyProvisionalIdentity(verification);
  }

  _parseIdentity(identityB64: b64string) {
    // Type verif arguments
    if (!identityB64 || typeof identityB64 !== 'string')
      throw new InvalidArgument('identity', 'b64string', identityB64);
    // End type verif
    const userData = extractUserData(identityB64);
    const userDataTrustchainId = utils.toBase64(userData.trustchainId);

    if (this.trustchainId !== userDataTrustchainId)
      throw new InvalidArgument(`The provided identity was not signed by the private key of the current trustchain: expected trustchain id "${this.trustchainId}", but got "${userDataTrustchainId}"`);
    return userData;
  }

  async stop(): Promise<void> {
    if (this._session) {
      const session = this._session;
      this._setSession(null);
      await session.close();
    }
  }

  _nuke = async (): Promise<void> => {
    const session = this._session;
    this._setSession(null);
    if (session) {
      await session.nuke();
    }
    this.emit('deviceRevoked');
  }

  async getDeviceList(): Promise<Array<{id: string, isRevoked: bool}>> {
    this.assert(statuses.READY, 'get the device list');
    const allDevices = await this._session.apis.userAccessor.findUserDevices({ userId: this._session.localUser.userId });
    return allDevices.filter(d => !d.isGhostDevice).map(d => ({ id: d.id, isRevoked: d.isRevoked }));
  }

  async share(resourceIds: Array<b64string>, options: SharingOptions): Promise<void> {
    this.assert(statuses.READY, 'share');

    if (!(resourceIds instanceof Array) || resourceIds.some(id => typeof id !== 'string'))
      throw new InvalidArgument('resourceIds', 'Array<b64string>', resourceIds);

    const sharingOptions = extractSharingOptions(options);

    if (isSharingOptionsEmpty(sharingOptions)) {
      throw new InvalidArgument(
        'options.shareWith*',
        'options.shareWithUsers or options.shareWithGroups must contain recipients',
        options
      );
    }

    return this._session.apis.dataProtector.share(resourceIds, sharingOptions);
  }

  async getResourceId(encryptedData: Uint8Array): Promise<b64string> {
    this.assert(statuses.READY, 'get a resource id');
    assertDataType(encryptedData, 'encryptedData');

    const source = await castData(encryptedData, { type: Uint8Array }, SAFE_RESOURCE_ID_EXTRACTION);

    try {
      return utils.toBase64(extractResourceId(source));
    } catch (e) {
      if (e instanceof DecryptionFailed) {
        throw new InvalidArgument('"encryptedData" is corrupted');
      }
      throw e;
    }
  }

  async revokeDevice(deviceId: b64string): Promise<void> {
    this.assert(statuses.READY, 'revoke a device');

    if (typeof deviceId !== 'string')
      throw new InvalidArgument('deviceId', 'string', deviceId);

    return this._session.apis.deviceManager.revokeDevice(deviceId);
  }

  async createGroup(users: Array<b64string>): Promise<b64string> {
    this.assert(statuses.READY, 'create a group');

    if (!(users instanceof Array))
      throw new InvalidArgument('users', 'Array<string>', users);

    return this._session.apis.groupManager.createGroup(users);
  }

  async updateGroupMembers(groupId: string, args: $Exact<{ usersToAdd: Array<string> }>): Promise<void> {
    this.assert(statuses.READY, 'update a group');

    const { usersToAdd } = args;

    if (!usersToAdd || !(usersToAdd instanceof Array))
      throw new InvalidArgument('usersToAdd', 'Array<string>', usersToAdd);

    if (typeof groupId !== 'string')
      throw new InvalidArgument('groupId', 'string', groupId);

    return this._session.apis.groupManager.updateGroupMembers(groupId, usersToAdd);
  }

  async makeEncryptorStream(options: SharingOptions = {}): Promise<EncryptorStream> {
    this.assert(statuses.READY, 'make a stream encryptor');

    const sharingOptions = extractSharingOptions(options);

    return this._session.apis.dataProtector.makeEncryptorStream(sharingOptions);
  }

  async makeDecryptorStream(): Promise<DecryptorStream> {
    this.assert(statuses.READY, 'make a stream decryptor');

    return this._session.apis.dataProtector.makeDecryptorStream();
  }

  async encryptData<T: Data>(clearData: Data, options?: $Shape<SharingOptions & OutputOptions<T>> = {}): Promise<T> {
    this.assert(statuses.READY, 'encrypt data');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const sharingOptions = extractSharingOptions(options);

    return this._session.apis.dataProtector.encryptData(clearData, sharingOptions, outputOptions);
  }

  async encrypt<T: Data>(plain: string, options?: $Shape<SharingOptions & OutputOptions<T>>): Promise<T> {
    this.assert(statuses.READY, 'encrypt');

    if (typeof plain !== 'string')
      throw new InvalidArgument('plain', 'string', plain);

    return this.encryptData(utils.fromString(plain), options);
  }

  async decryptData<T: Data>(encryptedData: Data, options?: $Shape<OutputOptions<T>> = {}): Promise<T> {
    this.assert(statuses.READY, 'decrypt data');
    assertDataType(encryptedData, 'encryptedData');

    const outputOptions = extractOutputOptions(options, encryptedData);

    return this._session.apis.dataProtector.decryptData(encryptedData, outputOptions);
  }

  async decrypt(cipher: Data): Promise<string> {
    return utils.toString(await this.decryptData(cipher, { type: Uint8Array }));
  }

  async upload<T: Data>(clearData: Data, options?: $Shape<SharingOptions & OutputOptions<T>> = {}): Promise<string> {
    this.assert(statuses.READY, 'upload a file');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const sharingOptions = extractSharingOptions(options);

    return this._session.apis.cloudStorageManager.upload(clearData, sharingOptions, outputOptions);
  }

  async download<T: Data>(resourceId: string, options?: $Shape<OutputOptions<T>> = {}): Promise<T> {
    this.assert(statuses.READY, 'download a file');

    if (typeof resourceId !== 'string')
      throw new InvalidArgument('resourceId', 'string', resourceId);

    if (!isObject(options))
      throw new InvalidArgument('options', '{ type: Class<T>, mime?: string, name?: string, lastModified?: number }', options);

    const outputOptions = extractOutputOptions({ type: defaultDownloadType, ...options });

    return this._session.apis.cloudStorageManager.download(resourceId, outputOptions);
  }
}

export default Tanker;
