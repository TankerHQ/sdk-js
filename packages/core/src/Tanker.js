// @flow
import EventEmitter from 'events';
import { random, tcrypto, utils, type b64string } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import { assertDataType, assertNotEmptyString, assertB64StringWithSize, castData } from '@tanker/types';
import type { Data } from '@tanker/types';
import { _deserializeProvisionalIdentity } from '@tanker/identity';

import { type ClientOptions, defaultApiEndpoint } from './Network/Client';
import { type DataStoreOptions } from './Session/Storage';

import type {
  Verification,
  EmailVerification,
  OIDCVerification,
  RemoteVerification,
  VerificationMethod,
  VerificationOptions, VerificationWithToken
} from './LocalUser/types';
import { assertVerification, assertVerificationOptions } from './LocalUser/types';
import { extractUserData } from './LocalUser/UserData';

import { assertStatus, statusDefs, statuses, type Status } from './Session/status';
import { Session } from './Session/Session';

import type { OutputOptions, ProgressOptions, EncryptionOptions, SharingOptions } from './DataProtection/options';
import {
  defaultDownloadType,
  extractOutputOptions,
  extractProgressOptions,
  extractEncryptionOptions,
  extractSharingOptions,
  isObject,
  isSharingOptionsEmpty
} from './DataProtection/options';
import type { EncryptionStream } from './DataProtection/EncryptionStream';
import type { DecryptionStream } from './DataProtection/DecryptionStream';
import { extractEncryptionFormat, SAFE_EXTRACTION_LENGTH } from './DataProtection/types';
import type { EncryptionSession } from './DataProtection/EncryptionSession';

import { TANKER_SDK_VERSION } from './version';

export type TankerCoreOptions = $Exact<{
  appId?: b64string,
  trustchainId?: b64string,
  url?: string,
  dataStore: DataStoreOptions,
  sdkType: string,
}>;

export type TankerOptions = $Exact<{
  appId?: b64string,
  trustchainId?: b64string,
  url?: string,
  dataStore?: DataStoreOptions,
  sdkType?: string,
}>;

export function optionsWithDefaults(options: TankerOptions, defaults: TankerCoreOptions): TankerCoreOptions {
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
  _trustchainId: b64string;
  _session: ?Session;
  _options: TankerCoreOptions;
  _clientOptions: ClientOptions;
  _dataStoreOptions: DataStoreOptions;

  static version = TANKER_SDK_VERSION;
  static statuses = statuses;

  constructor(options: TankerCoreOptions) {
    super();

    if (!options || typeof options !== 'object' || options instanceof Array) {
      throw new InvalidArgument('options', 'object', options);
    }

    if ('appId' in options) {
      assertB64StringWithSize(options.appId, 'options.appId', tcrypto.HASH_SIZE);
      this._trustchainId = ((options.appId: any): string);
    } else if ('trustchainId' in options) {
      console.warn('The "trustchainId" option is deprecated in favor of "appId", it will be removed in the future');
      assertB64StringWithSize(options.trustchainId, 'options.trustchainId', tcrypto.HASH_SIZE);
      this._trustchainId = ((options.trustchainId: any): string);
    } else {
      throw new InvalidArgument('options.appId', 'string', options.appId);
    }

    if (typeof options.dataStore !== 'object' || options.dataStore instanceof Array) {
      throw new InvalidArgument('options.dataStore', 'object', options.dataStore);
    } else if (typeof options.dataStore.adapter !== 'function') {
      throw new InvalidArgument('options.dataStore.adapter', 'function', options.dataStore.adapter);
    }

    assertNotEmptyString(options.sdkType, 'options.sdkType');
    this._options = options;

    const clientOptions: ClientOptions = {
      instanceInfo: {
        id: utils.toBase64(random(16)),
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
      adapter: options.dataStore.adapter
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

    /* eslint-disable no-underscore-dangle */
    if (typeof window !== 'undefined' && window.__TANKER_DEVTOOLS_GLOBAL_HOOK__) {
      window.__TANKER_DEVTOOLS_GLOBAL_HOOK__.registerTanker(this);
    }
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
    return def ? def.name : `invalid status: ${this.status}`;
  }

  addListener(eventName: string, listener: any): any {
    return this.on(eventName, listener);
  }

  on(eventName: string, listener: any): any {
    if (eventName === 'deviceRevoked') {
      console.warn('The "deviceRevoked" event is deprecated, it will be removed in the future');
    }
    return super.on(eventName, listener);
  }

  once(eventName: string, listener: any): any {
    if (eventName === 'deviceRevoked') {
      console.warn('The "deviceRevoked" event is deprecated, it will be removed in the future');
    }
    return super.once(eventName, listener);
  }

  set session(session: ?Session) {
    if (session) {
      this._session = session;
    } else {
      delete this._session;
    }
  }

  get session() {
    if (!this._session)
      throw new InternalError('Trying to access non existing _session');
    return this._session;
  }

  get deviceId(): b64string {
    assertStatus(this.status, statuses.READY, 'get the device id');

    const deviceId = this.session.deviceId();
    if (!deviceId)
      throw new InternalError('Tried to get our device id, but could not find it!');

    return utils.toBase64(deviceId);
  }

  async start(identityB64: b64string) {
    assertStatus(this.status, statuses.STOPPED, 'start a session');

    // Prepare the session
    const userData = this._parseIdentity(identityB64);
    const session = await Session.init(userData, this._dataStoreOptions, this._clientOptions);

    // Watch and start the session
    session.on('device_revoked', () => this._deviceRevoked());
    session.on('status_change', (s) => this.emit('statusChange', s));
    await session.start();

    // Set the session only if properly started
    this.session = session;

    return this.status;
  }

  async registerIdentity(verification: Verification, options?: VerificationOptions): Promise<?string> {
    assertStatus(this.status, statuses.IDENTITY_REGISTRATION_NEEDED, 'register an identity');
    assertVerification(verification);
    assertVerificationOptions(options);

    // $FlowIgnore Flow will complain that an _optional_ field is missing, because we're casting _from_ $Exact...
    const verifWithToken = (verification: VerificationWithToken);
    const withSessionToken = options && options.withSessionToken;
    if (withSessionToken) {
      if ('verificationKey' in verification)
        throw new InvalidArgument('verification', 'cannot get a session token for a verification key', verification);
      verifWithToken.withToken = { nonce: utils.toBase64(random(16)) };
    }

    await this.session.createUser(verifWithToken);

    if (withSessionToken) {
      return this.session.getSessionToken(verifWithToken);
    }
  }

  async verifyIdentity(verification: Verification, options?: VerificationOptions): Promise<?string> {
    assertVerification(verification);
    assertVerificationOptions(options);

    // $FlowIgnore Flow will complain that an _optional_ field is missing, because we're casting _from_ $Exact...
    const verifWithToken = (verification: VerificationWithToken);
    const withSessionToken = options && options.withSessionToken;
    if (withSessionToken) {
      assertStatus(this.status, [statuses.IDENTITY_VERIFICATION_NEEDED, statuses.READY], 'verify an identity with proof');
      if ('verificationKey' in verification)
        throw new InvalidArgument('verification', 'cannot get a session token for a verification key', verification);
      verifWithToken.withToken = { nonce: utils.toBase64(random(16)) };
    } else {
      assertStatus(this.status, statuses.IDENTITY_VERIFICATION_NEEDED, 'verify an identity');
    }

    if (this.status === statuses.IDENTITY_VERIFICATION_NEEDED) {
      await this.session.createNewDevice(verifWithToken);
    } else {
      await this.session.getVerificationKey(verification);
    }

    if (withSessionToken) {
      return this.session.getSessionToken(verifWithToken);
    }
  }

  async setVerificationMethod(verification: RemoteVerification, options?: VerificationOptions): Promise<?string> {
    assertStatus(this.status, statuses.READY, 'set a verification method');
    assertVerification(verification);
    assertVerificationOptions(options);
    if ('verificationKey' in verification)
      throw new InvalidArgument('verification', 'cannot update a verification key', verification);

    // $FlowIgnore Flow will complain that an _optional_ field is missing, because we're casting _from_ $Exact...
    const verifWithToken = (verification: VerificationWithToken);
    const withSessionToken = options && options.withSessionToken;

    if (withSessionToken) {
      verifWithToken.withToken = { nonce: utils.toBase64(random(16)) };
    }

    await this.session.setVerificationMethod(verifWithToken);

    if (withSessionToken) {
      return this.session.getSessionToken(verifWithToken);
    }
  }

  async getVerificationMethods(): Promise<Array<VerificationMethod>> {
    assertStatus(this.status, [statuses.READY, statuses.IDENTITY_VERIFICATION_NEEDED], 'get verification methods');
    return this.session.getVerificationMethods();
  }

  async generateVerificationKey(): Promise<string> {
    assertStatus(this.status, statuses.IDENTITY_REGISTRATION_NEEDED, 'generate a verification key');
    return this.session.generateVerificationKey();
  }

  async attachProvisionalIdentity(provisionalIdentity: b64string): Promise<*> {
    assertStatus(this.status, statuses.READY, 'attach a provisional identity');

    const provisionalIdentityObj = _deserializeProvisionalIdentity(provisionalIdentity);

    return this.session.attachProvisionalIdentity(provisionalIdentityObj);
  }

  async verifyProvisionalIdentity(verification: EmailVerification | OIDCVerification): Promise<void> {
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
      await session.stop();
    }
  }

  _deviceRevoked = async (): Promise<void> => {
    this.session = null; // the session has already closed itself
    this.emit('deviceRevoked');
  };

  async getDeviceList(): Promise<Array<{ id: string, isRevoked: bool }>> {
    assertStatus(this.status, statuses.READY, 'get the device list');
    const devices = await this.session.listDevices();
    return devices.map(d => ({
      id: utils.toBase64(d.deviceId),
      isRevoked: d.revoked
    }));
  }

  async share(resourceIds: Array<b64string>, options: SharingOptions): Promise<void> {
    assertStatus(this.status, statuses.READY, 'share');

    if (!(resourceIds instanceof Array))
      throw new InvalidArgument('resourceIds', 'Array<b64string>', resourceIds);
    resourceIds.forEach(id => assertB64StringWithSize(id, 'resourceId', tcrypto.MAC_SIZE));

    const sharingOptions = extractSharingOptions(options);

    if (isSharingOptionsEmpty(sharingOptions)) {
      throw new InvalidArgument(
        'options.shareWith*',
        'options.shareWithUsers or options.shareWithGroups must contain recipients',
        options
      );
    }

    return this.session.share(resourceIds, sharingOptions);
  }

  async getResourceId(encryptedData: Uint8Array): Promise<b64string> {
    assertStatus(this.status, statuses.READY, 'get a resource id');
    assertDataType(encryptedData, 'encryptedData');

    const castEncryptedData = await castData(encryptedData, { type: Uint8Array }, SAFE_EXTRACTION_LENGTH);

    const encryption = extractEncryptionFormat(castEncryptedData);

    return utils.toBase64(encryption.extractResourceId(castEncryptedData));
  }

  async revokeDevice(b64DeviceId: b64string): Promise<void> {
    console.warn('The "revokeDevice" method is deprecated, it will be removed in the future');
    assertStatus(this.status, statuses.READY, 'revoke a device');
    assertB64StringWithSize(b64DeviceId, 'deviceId', tcrypto.HASH_SIZE);
    const deviceId = utils.fromBase64(b64DeviceId);
    return this.session.revokeDevice(deviceId);
  }

  async createGroup(users: Array<b64string>): Promise<b64string> {
    assertStatus(this.status, statuses.READY, 'create a group');

    if (!(users instanceof Array))
      throw new InvalidArgument('users', 'Array<string>', users);
    users.forEach(user => assertNotEmptyString(user, 'users'));

    return this.session.createGroup(users);
  }

  async updateGroupMembers(groupId: string, args: $Exact<{ usersToAdd: Array<string> }>): Promise<void> {
    assertStatus(this.status, statuses.READY, 'update a group');
    if (!args)
      throw new InvalidArgument('usersToAdd', '{ usersToAdd: Array<string> }', args);

    const { usersToAdd } = args;

    if (!usersToAdd || !(usersToAdd instanceof Array) || usersToAdd.length === 0)
      throw new InvalidArgument('usersToAdd', 'Array<string>', usersToAdd);
    usersToAdd.forEach(user => assertNotEmptyString(user, 'usersToAdd'));

    assertB64StringWithSize(groupId, 'groupId', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);

    return this.session.updateGroupMembers(groupId, usersToAdd);
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

  async encryptData<T: Data>(clearData: Data, options?: $Shape<EncryptionOptions & OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertStatus(this.status, statuses.READY, 'encrypt data');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const progressOptions = extractProgressOptions(options);
    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.encryptData(clearData, encryptionOptions, outputOptions, progressOptions);
  }

  async encrypt<T: Data>(plain: string, options?: $Shape<EncryptionOptions & OutputOptions<T> & ProgressOptions>): Promise<T> {
    assertStatus(this.status, statuses.READY, 'encrypt');
    assertNotEmptyString(plain, 'plain');
    return this.encryptData(utils.fromString(plain), options);
  }

  async decryptData<T: Data>(encryptedData: Data, options?: $Shape<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertStatus(this.status, statuses.READY, 'decrypt data');
    assertDataType(encryptedData, 'encryptedData');

    const outputOptions = extractOutputOptions(options, encryptedData);
    const progressOptions = extractProgressOptions(options);

    return this.session.decryptData(encryptedData, outputOptions, progressOptions);
  }

  async decrypt(cipher: Data, options?: $Shape<ProgressOptions> = {}): Promise<string> {
    const progressOptions = extractProgressOptions(options);
    return utils.toString(await this.decryptData(cipher, {
      ...progressOptions,
      type: Uint8Array
    }));
  }

  async upload<T: Data>(clearData: Data, options?: $Shape<EncryptionOptions & OutputOptions<T> & ProgressOptions> = {}): Promise<string> {
    assertStatus(this.status, statuses.READY, 'upload a file');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const progressOptions = extractProgressOptions(options);
    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.upload(clearData, encryptionOptions, outputOptions, progressOptions);
  }

  async download<T: Data>(resourceId: string, options?: $Shape<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertStatus(this.status, statuses.READY, 'download a file');
    assertB64StringWithSize(resourceId, 'resourceId', tcrypto.MAC_SIZE);

    if (!isObject(options))
      throw new InvalidArgument('options', '{ type: Class<T>, mime?: string, name?: string, lastModified?: number }', options);

    const outputOptions = extractOutputOptions({ type: defaultDownloadType, ...options });
    const progressOptions = extractProgressOptions(options);

    return this.session.download(resourceId, outputOptions, progressOptions);
  }

  async createEncryptionSession(options: EncryptionOptions = {}): Promise<EncryptionSession> {
    assertStatus(this.status, statuses.READY, 'create an encryption session');

    const encryptionOptions = extractEncryptionOptions(options);

    return this.session.createEncryptionSession(encryptionOptions);
  }
}

export default Tanker;
