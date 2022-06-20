import EventEmitter from 'events';
import type { b64string } from '@tanker/crypto';
import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type { UserKeys, UserKeyPair } from '../Users/Serialize';
import { isDeviceCreation, userEntryFromBlock } from '../Users/Serialize';
import { applyDeviceCreationToUser } from '../Users/User';
import { verifyDeviceCreation } from '../Users/Verify';
import type { Device } from '../Users/types';

import { createBlock } from '../Blocks/Block';
import type { Nature } from '../Blocks/Nature';

import type { LocalData } from './KeyStore';
import type { LocalUserKeys } from './KeySafe';

import { trustchainCreationFromBlock } from './Serialize';
import { verifyTrustchainCreation } from './Verify';

export class LocalUser extends EventEmitter {
  _trustchainId: Uint8Array;
  _userId: Uint8Array;
  _userSecret: Uint8Array;

  _deviceSignatureKeyPair: tcrypto.SodiumKeyPair | null;
  _deviceEncryptionKeyPair: tcrypto.SodiumKeyPair | null;
  _userKeys: Record<string, tcrypto.SodiumKeyPair>;
  _currentUserKey: tcrypto.SodiumKeyPair | null;
  _devices: Array<Device>;

  _deviceId: Uint8Array | null;
  _trustchainPublicKey: Uint8Array | null;

  constructor(trustchainId: Uint8Array, userId: Uint8Array, userSecret: Uint8Array, localData: LocalData) {
    super();

    this._trustchainId = trustchainId;
    this._userId = userId;
    this._userSecret = userSecret;

    this._deviceEncryptionKeyPair = localData.deviceEncryptionKeyPair;
    this._deviceSignatureKeyPair = localData.deviceSignatureKeyPair;
    this._userKeys = localData.userKeys;
    this._currentUserKey = localData.currentUserKey;
    this._trustchainPublicKey = localData.trustchainPublicKey;
    this._deviceId = localData.deviceId;
    this._devices = localData.devices;
  }

  get localData() {
    return {
      deviceId: this._deviceId,
      deviceEncryptionKeyPair: this._deviceEncryptionKeyPair,
      deviceSignatureKeyPair: this._deviceSignatureKeyPair,
      userKeys: this._userKeys,
      currentUserKey: this._currentUserKey,
      trustchainPublicKey: this._trustchainPublicKey,
      devices: this._devices,
    };
  }

  get deviceEncryptionKeyPair(): tcrypto.SodiumKeyPair {
    if (!this._deviceEncryptionKeyPair) {
      throw new InternalError('Assertion failed: localUser was not initialized (device encryption key pair missing)');
    }
    return this._deviceEncryptionKeyPair;
  }

  set deviceEncryptionKeyPair(value: tcrypto.SodiumKeyPair) {
    this._deviceEncryptionKeyPair = value;
  }

  get deviceSignatureKeyPair(): tcrypto.SodiumKeyPair {
    if (!this._deviceSignatureKeyPair) {
      throw new InternalError('Assertion failed: localUser was not initialized (device signature key pair missing)');
    }
    return this._deviceSignatureKeyPair;
  }

  set deviceSignatureKeyPair(value: tcrypto.SodiumKeyPair) {
    this._deviceSignatureKeyPair = value;
  }

  get userId(): Uint8Array {
    return this._userId;
  }

  get deviceId(): Uint8Array {
    if (!this._deviceId) {
      throw new InternalError('Assertion failed: localUser was not initialized (device id missing)');
    }
    return this._deviceId;
  }

  set deviceId(value: Uint8Array) {
    this._deviceId = value;
  }

  get trustchainId(): Uint8Array {
    return this._trustchainId;
  }

  get isInitialized(): boolean {
    return !!this._trustchainPublicKey && !!this._deviceId;
  }

  get trustchainPublicKey(): Uint8Array {
    if (!this._trustchainPublicKey) {
      throw new InternalError('Assertion error: trustchain public key was not set');
    }
    return this._trustchainPublicKey;
  }

  get userSecret(): Uint8Array {
    return this._userSecret;
  }

  get devices(): Array<Device> {
    return this._devices;
  }

  findUserKey = (userPublicKey: Uint8Array): tcrypto.SodiumKeyPair | undefined => this._userKeys[utils.toBase64(userPublicKey)];

  get currentUserKey(): tcrypto.SodiumKeyPair {
    if (!this._currentUserKey) {
      throw new InternalError('Assertion failed: localUser was not initialized (current user encryption key pair missing)');
    }
    return this._currentUserKey;
  }

  makeBlock = (payload: Uint8Array, nature: Nature): b64string => {
    if (!this._deviceId) {
      throw new InternalError('Assertion failed: localUser was not initialized');
    }
    return createBlock(payload, nature, this._trustchainId, this._deviceId, this.deviceSignatureKeyPair.privateKey).block;
  };

  initializeWithBlocks = (b64Blocks: Array<b64string>) => {
    // Blocks should contain at least root block and first device
    if (b64Blocks.length < 2) {
      throw new InternalError('Assertion error: not enough blocks to update local user');
    }
    const trustchainCreationEntry = trustchainCreationFromBlock(b64Blocks[0]!);
    verifyTrustchainCreation(trustchainCreationEntry, this.trustchainId);
    this._trustchainPublicKey = trustchainCreationEntry.public_signature_key;

    this._initializeWithUserBlocks(b64Blocks.slice(1));
  };

  _initializeWithUserBlocks = (userBlocks: Array<string>) => {
    let user = null;
    const encryptedUserKeys: Array<UserKeys | UserKeyPair> = [];
    let deviceFound = false;

    for (const b64Block of userBlocks) {
      const userEntry = userEntryFromBlock(b64Block);

      if (isDeviceCreation(userEntry)) {
        verifyDeviceCreation(userEntry, user, this.trustchainId, this.trustchainPublicKey);
        user = applyDeviceCreationToUser(userEntry, user);

        if (utils.equalArray(this.deviceId, userEntry.hash)) {
          deviceFound = true;

          if (userEntry.user_key_pair) {
            encryptedUserKeys.unshift(userEntry.user_key_pair);
          }
        }
      }
    }

    if (!deviceFound) {
      throw new InternalError('Could not find our device in user blocks');
    }

    const localUserKeys = this._decryptUserKeys(encryptedUserKeys, this.deviceId);

    if (!user) {
      throw new InternalError('Assertion error: No user');
    }

    if (!localUserKeys.currentUserKey) {
      throw new InternalError('Assertion error: No current user key');
    }

    this._userKeys = localUserKeys.userKeys;
    this._currentUserKey = localUserKeys.currentUserKey;
    this._devices = user.devices;
  };

  _localUserKeysFromPrivateKey = (encryptedPrivateKey: Uint8Array, encryptionKeyPair: tcrypto.SodiumKeyPair, existingLocalUserKeys: LocalUserKeys | null): LocalUserKeys => {
    const privateKey = tcrypto.sealDecrypt(encryptedPrivateKey, encryptionKeyPair);
    const keyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(privateKey);
    const b64PublicKey = utils.toBase64(keyPair.publicKey);
    const res: Record<string, tcrypto.SodiumKeyPair> = {};
    res[b64PublicKey] = keyPair;

    if (existingLocalUserKeys) {
      return {
        userKeys: { ...existingLocalUserKeys.userKeys, ...res },
        currentUserKey: existingLocalUserKeys.currentUserKey,
      };
    }

    return {
      userKeys: res,
      currentUserKey: keyPair,
    };
  };

  _decryptUserKeys = (encryptedUserKeys: Array<UserKeys | UserKeyPair>, deviceId: Uint8Array): LocalUserKeys => {
    let localUserKeys: LocalUserKeys | null = null;

    for (const encryptedUserKey of encryptedUserKeys) {
      // Key for local device
      if ('encrypted_private_encryption_key' in encryptedUserKey) {
        localUserKeys = this._localUserKeysFromPrivateKey(encryptedUserKey.encrypted_private_encryption_key, this.deviceEncryptionKeyPair, localUserKeys);
        continue;
      }

      // Upgrade from userV1 to userV3
      if (utils.equalArray(new Uint8Array(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE), encryptedUserKey.previous_public_encryption_key))
        continue;

      // Key encrypted before our device creation
      const existingUserKey = localUserKeys && localUserKeys.userKeys[utils.toBase64(encryptedUserKey.public_encryption_key)];

      if (existingUserKey) {
        localUserKeys = this._localUserKeysFromPrivateKey(encryptedUserKey.encrypted_previous_encryption_key, existingUserKey, localUserKeys);
        // Key encrypted after our device creation
      } else {
        const privKey = encryptedUserKey.private_keys.find(k => utils.equalArray(k.recipient, deviceId));
        if (!privKey)
          throw new InternalError('Assertion error: Couldn\'t decrypt user keys from revocation');

        localUserKeys = this._localUserKeysFromPrivateKey(privKey.key, this.deviceEncryptionKeyPair, localUserKeys);
      }
    }

    if (!localUserKeys) {
      throw new InternalError('Assertion error: no user keys');
    }

    return localUserKeys;
  };
}

export default LocalUser;
