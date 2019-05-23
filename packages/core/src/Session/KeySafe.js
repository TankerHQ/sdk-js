// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { type UserKeys } from '../Blocks/payloads';
import * as EncryptorV1 from '../DataProtection/Encryptors/v1';

export type ProvisionalUserKeyPairs = {|
  id: string,
  appEncryptionKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair,
|};

export type IndexedProvisionalUserKeyPairs = { [id: string]: ProvisionalUserKeyPairs };

export type DeviceKeys = {|
  deviceId: ?b64string,
  signaturePair: tcrypto.SodiumKeyPair,
  encryptionPair: tcrypto.SodiumKeyPair,
|};

type KeySafeObject = {
  ...DeviceKeys,
  userSecret: Uint8Array,
  userKeys: Array<tcrypto.SodiumKeyPair>,
  encryptedUserKeys: Array<UserKeys>,
  provisionalUserKeys: IndexedProvisionalUserKeyPairs,
};

function startsWith(haystack: string, needle: string) {
  if (String.prototype.startsWith)
    return haystack.startsWith(needle);

  return haystack.substr(0, needle.length) === needle;
}

const base64Prefix = '__BASE64__';

async function encryptObject(key: Uint8Array, plainObject: Object): Promise<Uint8Array> {
  const json = JSON.stringify(plainObject, (_k, v) => {
    if (v instanceof Uint8Array) {
      return base64Prefix + utils.toBase64(v);
    }
    return v;
  });
  return EncryptorV1.encrypt(key, utils.fromString(json));
}

async function decryptObject(key: Uint8Array, ciphertext: Uint8Array): Promise<Object> {
  const jsonBytes = EncryptorV1.decrypt(key, ciphertext);
  return JSON.parse(utils.toString(jsonBytes), (_k, v) => {
    if (typeof v === 'string' && startsWith(v, base64Prefix))
      return utils.fromBase64(v.substring(base64Prefix.length));
    return v;
  });
}

// Note: this class is not responsible for the storage
export default class KeySafe {
  deviceId: ?b64string;
  userSecret: Uint8Array;
  signaturePair: tcrypto.SodiumKeyPair;
  encryptionPair: tcrypto.SodiumKeyPair;
  userKeys: Array<tcrypto.SodiumKeyPair>;
  encryptedUserKeys: Array<UserKeys>;
  provisionalUserKeys: IndexedProvisionalUserKeyPairs;

  constructor(obj: KeySafeObject) {
    if (!obj || !obj.signaturePair || !obj.encryptionPair)
      throw new Error('Invalid KeySafeObject provided to the KeySafe constructor');

    this.fromObject(obj);
  }

  fromObject = (obj: KeySafeObject) => {
    const { deviceId, userSecret, signaturePair, encryptionPair, userKeys, encryptedUserKeys, provisionalUserKeys } = obj;
    this.deviceId = deviceId;
    this.userSecret = userSecret;
    this.signaturePair = signaturePair;
    this.encryptionPair = encryptionPair;
    this.userKeys = userKeys;
    this.encryptedUserKeys = encryptedUserKeys;

    if (provisionalUserKeys instanceof Array) {
      // Format migration for device created with SDKs in the v2.0.0-alpha series:
      for (const puk of provisionalUserKeys) {
        this.provisionalUserKeys[puk.id] = puk;
      }
    } else {
      // Add an empty default for devices created before SDK v2
      this.provisionalUserKeys = provisionalUserKeys || {};
    }
  };

  asObject = (): KeySafeObject => ({
    userSecret: this.userSecret,
    signaturePair: this.signaturePair,
    encryptionPair: this.encryptionPair,
    userKeys: this.userKeys,
    deviceId: this.deviceId,
    encryptedUserKeys: this.encryptedUserKeys,
    provisionalUserKeys: this.provisionalUserKeys,
  });

  serialize = async (): Promise<b64string> => {
    const encrypted = await encryptObject(this.userSecret, this.asObject());
    return utils.toBase64(encrypted);
  };

  static create(userSecret: Uint8Array): KeySafe {
    return new KeySafe({
      deviceId: null,
      userSecret,
      signaturePair: tcrypto.makeSignKeyPair(),
      encryptionPair: tcrypto.makeEncryptionKeyPair(),
      userKeys: [],
      encryptedUserKeys: [],
      provisionalUserKeys: {},
    });
  }

  static async open(userSecret: Uint8Array, serializedSafe: b64string): Promise<KeySafe> {
    try {
      const encryptedSafe = utils.fromBase64(serializedSafe);
      const obj = await decryptObject(userSecret, encryptedSafe);
      return new KeySafe(obj);
    } catch (error) {
      throw new Error(`Error when decrypting the local KeySafe: ${error}`);
    }
  }
}
