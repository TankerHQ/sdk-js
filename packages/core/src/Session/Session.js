// @flow

import EventEmitter from 'events';
import { tcrypto, utils } from '@tanker/crypto';
import Trustchain from '../Trustchain/Trustchain';
import { PromiseWrapper } from '../PromiseWrapper';
import UserAccessor from '../Users/UserAccessor';
import Storage, { type DataStoreOptions } from './Storage';
import KeyStore from './Keystore';
import { UnlockKeys } from '../Unlock/UnlockKeys';
import { Unlocker } from '../Unlock/Unlocker';
import { DEVICE_TYPE } from '../Unlock/unlock';

import { type UserData, type SessionData } from '../Tokens/SessionTypes';
import GroupManager from '../Groups/Manager';

import { takeChallenge } from './ClientAuthenticator';
import { Client, type ClientOptions } from '../Network/Client';
import BlockGenerator from '../Blocks/BlockGenerator';
import Encryptor from '../Encryption/Encryptor';
import { type UserDeviceRecord } from '../Blocks/payloads';

import { MissingEventHandler, OperationCanceled } from '../errors';

function generateNewUserBlock(keyStore: KeyStore, userData: UserData) {
  const userKeys = tcrypto.makeEncryptionKeyPair();
  const encryptedUserKey = tcrypto.sealEncrypt(
    userKeys.privateKey,
    keyStore.publicEncryptionKey,
  );
  const user: UserDeviceRecord = {
    ephemeral_public_signature_key: new Uint8Array(0),
    user_id: userData.userId,
    delegation_signature: new Uint8Array(0),
    public_signature_key: keyStore.publicSignatureKey,
    public_encryption_key: keyStore.publicEncryptionKey,
    last_reset: new Uint8Array(tcrypto.HASH_SIZE),
    user_key_pair: {
      public_encryption_key: userKeys.publicKey,
      encrypted_private_encryption_key: encryptedUserKey,
    },
    is_ghost_device: false,
    is_server_device: false,
    revoked: Number.MAX_SAFE_INTEGER,
  };

  const blockGenerator = new BlockGenerator(
    userData.trustchainId,
    keyStore.privateSignatureKey,
    new Uint8Array(0), // no deviceId available yet
  );

  return blockGenerator.addUser(user, userData.delegationToken);
}

export class Session {
  sessionData: SessionData;

  storage: Storage;
  _trustchain: Trustchain;
  _client: Client;

  blockGenerator: BlockGenerator;
  userAccessor: UserAccessor;
  groupManager: GroupManager;
  encryptor: Encryptor;
  unlockKeys: UnlockKeys;

  constructor(sessionData: SessionData, storage: Storage, trustchain: Trustchain, client: Client) {
    this.storage = storage;
    this._trustchain = trustchain;
    this.sessionData = sessionData;
    this._client = client;

    this.blockGenerator = new BlockGenerator(
      sessionData.trustchainId,
      storage.keyStore.privateSignatureKey,
      sessionData.deviceId,
    );

    this.userAccessor = new UserAccessor(storage.userStore, trustchain, sessionData.trustchainId, sessionData.userId);
    this.groupManager = new GroupManager(
      sessionData.trustchainId,
      trustchain,
      storage.groupStore,
      this.userAccessor,
      this.blockGenerator,
      client,
    );
    this.encryptor = new Encryptor(
      this.sessionData,
      this.storage,
      this._client,
      this._trustchain,
      this.groupManager,
      this.userAccessor,
    );
    this.unlockKeys = new UnlockKeys(
      this.sessionData,
      this.storage.keyStore,
      this._client,
    );
  }

  get userId(): Uint8Array {
    return this.sessionData.userId;
  }

  close = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.close();
  }

  nuke = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this.storage.nuke();
  }

  async revokeDevice(revokedDeviceId: string): Promise<void> {
    const user = await this.userAccessor.findUser({ hashedUserId: this.sessionData.userId });
    if (!user)
      throw new Error('Cannot find the current user in the users');

    const publicEncryptionKeys = user.devices
      .filter(device => device.revokedAt === Number.MAX_SAFE_INTEGER && device.deviceId !== revokedDeviceId);

    const userKeys = await this.storage.keyStore.rotateUserKeys(publicEncryptionKeys);
    const revocationRecord = {
      device_id: utils.fromBase64(revokedDeviceId),
      user_keys: userKeys
    };

    const revokeDeviceBlock = this.blockGenerator.revokeDevice(revocationRecord);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._trustchain.forceSync([], []);
  }
}

export class SessionOpener extends EventEmitter {
  _storage: Storage;
  _trustchain: Trustchain;
  _client: Client;
  _userData: UserData;

  unlocker: Unlocker
  _openBlocked: PromiseWrapper<void>;

  constructor(userData: UserData, storage: Storage, trustchain: Trustchain, client: Client) {
    super();

    this._storage = storage;
    this._trustchain = trustchain;
    this._userData = userData;
    this._client = client;

    this.unlocker = new Unlocker(
      this._userData,
      this._storage.keyStore,
      this._client,
    );
  }

  static create = async (userData: UserData, storeOptions: DataStoreOptions, clientOptions: ClientOptions) => {
    const client = new Client(userData.trustchainId, clientOptions);
    client.open();
    const storage = new Storage(storeOptions);
    await storage.open(userData.userId, userData.userSecret);

    const trustchain: Trustchain = await Trustchain.open(client, userData.trustchainId, userData.userId, storage);

    return new SessionOpener(userData, storage, trustchain, client);
  }

  openSession = async (allowedToUnlock: bool): Promise<Session> => {
    if (!this._storage.hasLocalDevice()) {
      const userExists = await this._client.userExists(this._userData.trustchainId, this._userData.userId, this._storage.keyStore.publicSignatureKey);
      if (userExists) {
        this._openBlocked = new PromiseWrapper();
        const publicSignatureKeySignature = tcrypto.sign(this._storage.keyStore.publicSignatureKey, this._storage.keyStore.privateSignatureKey);
        await this._client.subscribeToCreation(this._storage.keyStore.publicSignatureKey, publicSignatureKeySignature, this._openBlocked.resolve);

        if (this._userData.deviceType === DEVICE_TYPE.server_device) {
          // $FlowIKnow that unlockKey is present in userData
          await this.unlocker.unlockWithUnlockKey(this._userData.unlockKey);
        } else if (!this._openBlocked.settled && !allowedToUnlock) {
          delete this._openBlocked;
          throw new MissingEventHandler('unlockRequired');
        } else {
          this.emit('unlockRequired');
        }
        await this._openBlocked.promise;
      } else {
        const newUserBlock = generateNewUserBlock(this._storage.keyStore, this._userData);
        await this._client.sendBlock(newUserBlock);
      }
    }
    const unlockMethods = await this._client.setAuthenticator((challenge: string) => takeChallenge(this._userData, this._storage.keyStore.signatureKeyPair, challenge));
    await this._trustchain.ready();

    if (this._storage.keyStore.wasRevoked) {
      await this._client.close();
      await this._trustchain.close();
      await this._storage.close();

      throw new OperationCanceled('this device was revoked');
    }

    const { deviceId } = this._storage.keyStore;
    if (!deviceId)
      throw new Error('assertion error: still no device id at end of open');

    return new Session({ ...this._userData, deviceId, unlockMethods }, this._storage, this._trustchain, this._client);
  };

  cancel = async () => {
    await this._trustchain.close();
    await this._client.close();
    await this._storage.close();

    if (this._openBlocked) {
      this._openBlocked.reject(new OperationCanceled('Open canceled while unlocking'));
    }
  }
}
