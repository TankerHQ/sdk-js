import EventEmitter from 'events';
import type { b64string } from '@tanker/crypto';
import { randomBase64Token, ready as cryptoReady, tcrypto, utils, extractEncryptionFormat, SAFE_EXTRACTION_LENGTH } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import { assertDataType, assertInteger, assertNotEmptyString, castData } from '@tanker/types';
import type { Data, ResourceMetadata } from '@tanker/types';

import { _deserializeProvisionalIdentity, isSecretProvisionalIdentity } from './Identity';
import type { ClientOptions } from './Network/Client';
import { Client, defaultApiEndpoint } from './Network/Client';
import { LocalUserManager } from './LocalUser/Manager';
import type { DataStoreOptions } from './Session/Storage';

import {
  Verification,
  EmailVerification,
  OIDCVerification,
  RemoteVerification,
  VerificationMethod,
  VerificationOptions,
  VerificationWithToken,
  PhoneNumberVerification,
  LegacyEmailVerificationMethod,
  PreverifiedVerification,
  assertVerifications,
  assertVerification,
  assertVerificationOptions,
  isPreverifiedVerification,
  countPreverifiedVerifications,
} from './LocalUser/types';
import { extractUserData } from './LocalUser/UserData';

import { statuses, assertStatus, statusDefs } from './Session/status';
import type { Status } from './Session/status';
import { Session } from './Session/Session';

import type { OutputOptions, ProgressOptions, EncryptionOptions, SharingOptions } from './DataProtection/options';
import {
  defaultDownloadType,
  extractOutputOptions,
  extractProgressOptions,
  extractEncryptionOptions,
  extractResourceMetadata,
  extractSharingOptions,
  isObject,
  isSharingOptionsEmpty,
} from './DataProtection/options';
import type { EncryptionStream } from './DataProtection/EncryptionStream';
import type { DecryptionStream } from './DataProtection/DecryptionStream';
import type { EncryptionSession } from './DataProtection/EncryptionSession';
import type { UploadStream } from './CloudStorage/UploadStream';
import type { DownloadStream } from './CloudStorage/DownloadStream';
import type { AttachResult } from './ProvisionalIdentity/types';
import { Lock } from './lock';

import { TANKER_SDK_VERSION } from './version';

export type TankerCoreOptions = {
  appId?: b64string;
  url?: string;
  dataStore: DataStoreOptions;
  sdkType: string;
};

export type TankerOptions = Partial<Omit<TankerCoreOptions, 'dataStore'> & { dataStore: Partial<DataStoreOptions>; }>;

export type Device = { id: string; isRevoked: boolean; };
export type ProvisionalVerification = EmailVerification | OIDCVerification | PhoneNumberVerification;

export function optionsWithDefaults(options: TankerOptions, defaults: TankerCoreOptions): TankerCoreOptions {
  if (!options || typeof options !== 'object' || options instanceof Array)
    throw new InvalidArgument('options', 'object', options);

  if (!defaults || typeof defaults !== 'object' || defaults instanceof Array)
    throw new InvalidArgument('defaults', 'object', defaults);

  // Deep merge dataStore option
  const result = {
    ...defaults,
    ...options,
    dataStore: {
      ...defaults.dataStore,
      ...options.dataStore,
    },
  };

  return result;
}

export class Tanker extends EventEmitter {
  _trustchainId: b64string;
  _session?: Session;
  _options: TankerCoreOptions;
  _clientOptions: ClientOptions;
  _dataStoreOptions: DataStoreOptions;
  _localDeviceLock: Lock;

  static version = TANKER_SDK_VERSION;
  static statuses = statuses;

  constructor(options: TankerCoreOptions) {
    super();

    if (!options || typeof options !== 'object' || options instanceof Array) {
      throw new InvalidArgument('options', 'object', options);
    }

    if ('appId' in options) {
      utils.assertB64StringWithSize(options.appId, 'options.appId', tcrypto.HASH_SIZE);
      this._trustchainId = options.appId as string;
    } else {
      throw new InvalidArgument('options.appId', 'string', options.appId);
    }

    if (typeof options.dataStore !== 'object' || options.dataStore instanceof Array) {
      throw new InvalidArgument('options.dataStore', 'object', options.dataStore);
    } else if (typeof options.dataStore.adapter !== 'function') {
      throw new InvalidArgument('options.dataStore.adapter', 'function', options.dataStore.adapter);
    }

    assertNotEmptyString(options.sdkType, 'options.sdkType');
    this._localDeviceLock = new Lock();
    this._options = options;

    const clientOptions: ClientOptions = {
      instanceInfo: {
        id: randomBase64Token(),
      },
      sdkInfo: {
        type: options.sdkType,
        version: Tanker.version,
      },
      url: defaultApiEndpoint,
    };
    if (options.url) {
      clientOptions.url = options.url;
    }
    this._clientOptions = clientOptions;

    const datastoreOptions: DataStoreOptions = {
      adapter: options.dataStore.adapter,
    };
    if (options.dataStore.prefix) {
      datastoreOptions.prefix = options.dataStore.prefix;
    }
    if (options.dataStore.dbPath) {
      datastoreOptions.dbPath = options.dataStore.dbPath;
    }
    if (options.dataStore.url) {
      datastoreOptions.url = options.dataStore.url;
    }
    this._dataStoreOptions = datastoreOptions;
  }

  get appId(): b64string {
    return this._trustchainId;
  }

  get trustchainId(): b64string {
    return this._trustchainId;
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
    return def && def.name || `invalid status: ${this.status}`;
  }

  override addListener(eventName: string, listener: any): any {
    return this.on(eventName, listener);
  }

  override on(eventName: string, listener: any): any {
    if (eventName === 'statusChanged') {
      console.warn('The "statusChanged" event is deprecated, it will be removed in the future');
    }

    return super.on(eventName, listener);
  }

  override once(eventName: string, listener: any): any {
    if (eventName === 'statusChanged') {
      console.warn('The "statusChanged" event is deprecated, it will be removed in the future');
    }

    return super.once(eventName, listener);
  }

  set session(session: Session | null) {
    if (session) {
      this._session = session;
    } else {
      delete this._session;
    }
  }

  get session(): Session {
    if (!this._session)
      throw new InternalError('Trying to access non existing _session');
    return this._session;
  }

  get deviceId(): b64string {
    console.warn('The "deviceId" property is deprecated, it will be removed in the future');

    assertStatus(this.status, statuses.READY, 'get the device id');

    const deviceId = this.session.deviceId();
    if (!deviceId)
      throw new InternalError('Tried to get our device id, but could not find it!');

    return utils.toBase64(deviceId);
  }

  _lockCall<T, F extends (...args: any[]) => Promise<T>>(name: string, f: F): (...args: Parameters<F>) => ReturnType<F> {
    return (...args: Parameters<F>) => this._localDeviceLock.lock(name, () => f(...args)) as ReturnType<F>;
  }

  enrollUser = this._lockCall('enrollUser', async (identityB64: b64string, verifications: Array<PreverifiedVerification>): Promise<void> => {
    assertStatus(this.status, statuses.STOPPED, 'enroll a user');

    // Prepare the session
    await cryptoReady;

    const userData = this._parseIdentity(identityB64);

    assertVerifications(verifications);
    if (verifications.length === 0) {
      throw new InvalidArgument('verifications', 'should contain at least one preverified verification method');
    }

    if (!verifications.every(isPreverifiedVerification)) {
      throw new InvalidArgument('verifications', 'can only enroll user with preverified verification methods', verifications);
    }

    const counts = countPreverifiedVerifications(verifications);
    if (counts.preverifiedEmail > 1 || counts.preverifiedPhoneNumber > 1) {
      throw new InvalidArgument('verications', 'contains at most one of each preverified verification method', counts);
    }

    const client = new Client(userData.trustchainId, userData.userId, this._clientOptions);
    await LocalUserManager.enrollUser(userData, client, verifications);
    await client.close();
  });

  start = this._lockCall('start', async (identityB64: b64string) => {
    assertStatus(this.status, statuses.STOPPED, 'start a session');

    // Prepare the session
    await cryptoReady;

    const userData = this._parseIdentity(identityB64);

    const session = await Session.init(userData, this._dataStoreOptions, this._clientOptions);
    // Watch and start the session
    session.on('device_revoked', () => this._deviceRevoked());
    session.on('status_change', s => this.emit('statusChange', s));
    await session.start();

    // Set the session only if properly started
    this.session = session;

    return this.status;
  });

  registerIdentity = this._lockCall('registerIdentity', async (verification: Verification, options?: VerificationOptions): Promise<string | null> => {
    assertStatus(this.status, statuses.IDENTITY_REGISTRATION_NEEDED, 'register an identity');
    assertVerification(verification);
    assertVerificationOptions(options);

    const verifWithToken: VerificationWithToken = verification;
    const withSessionToken = options && options.withSessionToken;
    if (withSessionToken) {
      if ('verificationKey' in verification)
        throw new InvalidArgument('verification', 'cannot get a session token for a verification key', verification);
      verifWithToken.withToken = { nonce: randomBase64Token() };
    }

    if ('preverifiedEmail' in verification || 'preverifiedPhoneNumber' in verification) {
      throw new InvalidArgument('verification', 'cannot register identity with preverified methods');
    }

    await this.session.createUser(verifWithToken);

    if (withSessionToken) {
      return this.session.getSessionToken(verifWithToken);
    }

    return null;
  });

  verifyIdentity = this._lockCall('verifyIdentity', async (verification: Verification, options?: VerificationOptions): Promise<string | null> => {
    assertVerification(verification);
    assertVerificationOptions(options);

    const verifWithToken: VerificationWithToken = verification;
    const withSessionToken = options && options.withSessionToken;
    if (withSessionToken) {
      assertStatus(this.status, [statuses.IDENTITY_VERIFICATION_NEEDED, statuses.READY], 'verify an identity with proof');
      if ('verificationKey' in verification)
        throw new InvalidArgument('verification', 'cannot get a session token for a verification key', verification);
      verifWithToken.withToken = { nonce: randomBase64Token() };
    } else {
      assertStatus(this.status, statuses.IDENTITY_VERIFICATION_NEEDED, 'verify an identity');
    }

    if ('preverifiedEmail' in verification || 'preverifiedPhoneNumber' in verification) {
      throw new InvalidArgument('verification', 'cannot verify identity with preverified methods');
    }

    if (this.status === statuses.IDENTITY_VERIFICATION_NEEDED) {
      await this.session.createNewDevice(verifWithToken);
    } else {
      await this.session.getVerificationKey(verification);
    }

    if (withSessionToken) {
      return this.session.getSessionToken(verifWithToken);
    }

    return null;
  });

  async setVerificationMethod(verification: RemoteVerification, options?: VerificationOptions): Promise<string | null> {
    assertStatus(this.status, statuses.READY, 'set a verification method');
    assertVerification(verification);
    assertVerificationOptions(options);

    if ('verificationKey' in verification)
      throw new InvalidArgument('verification', 'cannot update a verification key', verification);

    const verifWithToken: VerificationWithToken = verification;
    const withSessionToken = options && options.withSessionToken;

    if (withSessionToken) {
      if (isPreverifiedVerification(verifWithToken)) {
        throw new InvalidArgument('verification', 'cannot set verification method with both preverified methods and session token');
      }
      verifWithToken.withToken = { nonce: randomBase64Token() };
    }

    await this.session.setVerificationMethod(verifWithToken);

    if (withSessionToken) {
      return this.session.getSessionToken(verifWithToken);
    }

    return null;
  }

  async getVerificationMethods(): Promise<Array<VerificationMethod | LegacyEmailVerificationMethod>> {
    assertStatus(this.status, [statuses.READY, statuses.IDENTITY_VERIFICATION_NEEDED], 'get verification methods');
    return this.session.getVerificationMethods();
  }

  async generateVerificationKey(): Promise<string> {
    assertStatus(this.status, statuses.IDENTITY_REGISTRATION_NEEDED, 'generate a verification key');
    return this.session.generateVerificationKey();
  }

  async attachProvisionalIdentity(provisionalIdentity: b64string): Promise<AttachResult> {
    assertStatus(this.status, statuses.READY, 'attach a provisional identity');

    const provisionalIdentityObj = _deserializeProvisionalIdentity(provisionalIdentity);
    if (!isSecretProvisionalIdentity(provisionalIdentityObj)) {
      throw new InvalidArgument('provisionalIdentity', 'identity should be a private provisional identity');
    }

    return this.session.attachProvisionalIdentity(provisionalIdentityObj);
  }

  async verifyProvisionalIdentity(verification: ProvisionalVerification): Promise<void> {
    assertStatus(this.status, statuses.READY, 'verify a provisional identity');
    assertVerification(verification);
    return this.session.verifyProvisionalIdentity(verification);
  }

  _parseIdentity(identityB64: b64string) {
    assertNotEmptyString(identityB64, 'identity');
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
      this.session = null;
      this._localDeviceLock = new Lock();
      await session.stop();
    }
  }

  _deviceRevoked = async (): Promise<void> => {
    this.session = null; // the session has already closed itself
  };

  async getDeviceList(): Promise<Array<Device>> {
    console.warn('The "getDeviceList" method is deprecated, it will be removed in the future');

    assertStatus(this.status, statuses.READY, 'get the device list');

    const devices = await this.session.listDevices();
    return devices.map(d => ({
      id: utils.toBase64(d.deviceId),
      isRevoked: d.revoked,
    }));
  }

  async share(resourceIds: Array<b64string>, options: SharingOptions): Promise<void> {
    assertStatus(this.status, statuses.READY, 'share');

    if (!(resourceIds instanceof Array))
      throw new InvalidArgument('resourceIds', 'Array<b64string>', resourceIds);
    if (resourceIds.length === 0) {
      return;
    }
    resourceIds.forEach(id => utils.assertB64StringWithSize(id, 'resourceId', tcrypto.MAC_SIZE));

    const sharingOptions = extractSharingOptions(options);

    if (isSharingOptionsEmpty(sharingOptions)) {
      throw new InvalidArgument(
        'options.shareWith*',
        'options.shareWithUsers or options.shareWithGroups must contain recipients',
        options,
      );
    }

    return this.session.share(resourceIds, sharingOptions);
  }

  async getResourceId(encryptedData: Data): Promise<b64string> {
    assertDataType(encryptedData, 'encryptedData');

    const castEncryptedData = await castData(encryptedData, { type: Uint8Array }, SAFE_EXTRACTION_LENGTH);

    const encryption = extractEncryptionFormat(castEncryptedData);

    return utils.toBase64(encryption.extractResourceId(castEncryptedData));
  }

  async createGroup(users: Array<b64string>): Promise<b64string> {
    assertStatus(this.status, statuses.READY, 'create a group');

    if (!(users instanceof Array))
      throw new InvalidArgument('users', 'Array<string>', users);
    users.forEach(user => assertNotEmptyString(user, 'users'));

    if (users.length === 0)
      throw new InvalidArgument('no members to add in new group');

    return this.session.createGroup(users);
  }

  async updateGroupMembers(groupId: string, args: { usersToAdd?: Array<string>; usersToRemove?: Array<string>; }): Promise<void> {
    assertStatus(this.status, statuses.READY, 'update a group');

    if (!args || typeof args !== 'object')
      throw new InvalidArgument('usersToAdd', '{ usersToAdd?: Array<string>, usersToRemove?: Array<string> }', args);

    const { usersToAdd, usersToRemove } = args;

    if (usersToAdd) {
      if (!(usersToAdd instanceof Array))
        throw new InvalidArgument('usersToAdd', 'Array<string>', usersToAdd);
      usersToAdd.forEach(user => assertNotEmptyString(user, 'usersToAdd'));
    }
    if (usersToRemove) {
      if (!(usersToRemove instanceof Array))
        throw new InvalidArgument('usersToRemove', 'Array<string>', usersToRemove);
      usersToRemove.forEach(user => assertNotEmptyString(user, 'usersToRemove'));
    }

    const nonOptUsersToAdd = usersToAdd || [];
    const nonOptUsersToRemove = usersToRemove || [];

    if (nonOptUsersToAdd.length === 0 && nonOptUsersToRemove.length === 0)
      throw new InvalidArgument('no members to add or remove in updateGroupMembers');

    utils.assertB64StringWithSize(groupId, 'groupId', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    return this.session.updateGroupMembers(groupId, nonOptUsersToAdd, nonOptUsersToRemove);
  }

  async createEncryptionStream(options: EncryptionOptions = {}): Promise<EncryptionStream> {
    assertStatus(this.status, statuses.READY, 'create an encryption stream');

    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.createEncryptionStream(encryptionOptions);
  }

  async createDecryptionStream(): Promise<DecryptionStream> {
    assertStatus(this.status, statuses.READY, 'create a decryption stream');

    return this.session.createDecryptionStream();
  }

  async encryptData<I extends Data>(clearData: I, options?: EncryptionOptions & ResourceMetadata & ProgressOptions): Promise<I>;
  async encryptData<T extends Data>(clearData: Data, options?: EncryptionOptions & OutputOptions<T> & ProgressOptions): Promise<T>;
  async encryptData(clearData: Data, options: Partial<EncryptionOptions & OutputOptions<Data> & ProgressOptions> = {}): Promise<any> {
    assertStatus(this.status, statuses.READY, 'encrypt data');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const progressOptions = extractProgressOptions(options);
    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.encryptData(clearData, encryptionOptions, outputOptions, progressOptions);
  }

  async encrypt(plain: string, options?: EncryptionOptions & ResourceMetadata & ProgressOptions): Promise<Uint8Array>;
  async encrypt<T extends Data>(plain: string, options?: EncryptionOptions & OutputOptions<T> & ProgressOptions): Promise<T>;
  async encrypt(plain: string, options?: Partial<EncryptionOptions & OutputOptions<Data> & ProgressOptions>): Promise<any> {
    assertStatus(this.status, statuses.READY, 'encrypt');
    assertNotEmptyString(plain, 'plain');
    return this.encryptData(utils.fromString(plain), options);
  }

  async decryptData<I extends Data>(encryptedData: I, options?: ResourceMetadata & ProgressOptions): Promise<I>;
  async decryptData<T extends Data>(encryptedData: Data, options?: OutputOptions<T> & ProgressOptions): Promise<T>;
  async decryptData(encryptedData: Data, options: Partial<OutputOptions<Data> & ProgressOptions> = {}): Promise<any> {
    assertStatus(this.status, statuses.READY, 'decrypt data');
    assertDataType(encryptedData, 'encryptedData');

    const outputOptions = extractOutputOptions(options, encryptedData);
    const progressOptions = extractProgressOptions(options);

    return this.session.decryptData(encryptedData, outputOptions, progressOptions);
  }

  async decrypt(cipher: Data, options: ProgressOptions = {}): Promise<string> {
    assertStatus(this.status, statuses.READY, 'decrypt');
    const progressOptions = extractProgressOptions(options);
    return utils.toString(await this.decryptData(cipher, {
      ...progressOptions,
      type: Uint8Array,
    }));
  }

  async upload(clearData: Data, options: EncryptionOptions & ResourceMetadata & ProgressOptions = {}): Promise<string> {
    assertStatus(this.status, statuses.READY, 'upload a file');
    assertDataType(clearData, 'clearData');

    const resourceMetadata = extractResourceMetadata(options, clearData);
    const progressOptions = extractProgressOptions(options);
    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.upload(clearData, encryptionOptions, resourceMetadata, progressOptions);
  }

  async download(resourceId: b64string, options?: ResourceMetadata & ProgressOptions): Promise<globalThis.File | Uint8Array>;
  async download<T extends Data>(resourceId: b64string, options?: OutputOptions<T> & ProgressOptions): Promise<T>;
  async download(resourceId: b64string, options: Partial<OutputOptions<Data> & ProgressOptions> = {}): Promise<any> {
    assertStatus(this.status, statuses.READY, 'download a file');
    utils.assertB64StringWithSize(resourceId, 'resourceId', tcrypto.MAC_SIZE);

    if (!isObject(options))
      throw new InvalidArgument('options', '{ type: Class<T>, mime?: string, name?: string, lastModified?: number, onProgress?: OnProgress }', options);

    const outputOptions = extractOutputOptions({ type: defaultDownloadType, ...options });
    const progressOptions = extractProgressOptions(options);

    return this.session.download(resourceId, outputOptions, progressOptions);
  }

  async createUploadStream(clearSize: number, options: EncryptionOptions & ResourceMetadata & ProgressOptions = {}): Promise<UploadStream> {
    assertStatus(this.status, statuses.READY, 'upload a file using stream');
    assertInteger(clearSize, 'clearSize', true);

    const resourceMetadata = extractResourceMetadata(options);
    const progressOptions = extractProgressOptions(options);
    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.createUploadStream(clearSize, encryptionOptions, resourceMetadata, progressOptions);
  }

  async createDownloadStream(resourceId: b64string, options: ProgressOptions = {}): Promise<DownloadStream> {
    assertStatus(this.status, statuses.READY, 'download a file using stream');
    utils.assertB64StringWithSize(resourceId, 'resourceId', tcrypto.MAC_SIZE);

    if (!isObject(options))
      throw new InvalidArgument('options', '{ onProgress?: OnProgress }', options);

    const progressOptions = extractProgressOptions(options);

    return this.session.createDownloadStream(resourceId, progressOptions);
  }

  async createEncryptionSession(options: EncryptionOptions = {}): Promise<EncryptionSession> {
    assertStatus(this.status, statuses.READY, 'create an encryption session');

    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.createEncryptionSession(encryptionOptions);
  }
}

export default Tanker;
