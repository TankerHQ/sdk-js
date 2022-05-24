import type { b64string } from '@tanker/crypto';
import { tcrypto, utils, encryptionV1 } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type { Device } from '../Users/types';

export type ProvisionalUserKeyPairs = {
  id: string;
  appEncryptionKeyPair: tcrypto.SodiumKeyPair;
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair;
};

export type LocalUserKeys = { currentUserKey: tcrypto.SodiumKeyPair; userKeys: Record<string, tcrypto.SodiumKeyPair>; };

export type IndexedProvisionalUserKeyPairs = Record<string, ProvisionalUserKeyPairs>;

export type KeySafe = {
  signaturePair: tcrypto.SodiumKeyPair | null;
  encryptionPair: tcrypto.SodiumKeyPair | null;
  provisionalUserKeys: IndexedProvisionalUserKeyPairs;
  devices: Array<Device>;
  deviceId: b64string | null;
  trustchainPublicKey: b64string | null;
  localUserKeys: LocalUserKeys | null;
};

const base64Prefix = '__BASE64__';

async function encryptObject(key: Uint8Array, plainObject: Record<string, unknown>): Promise<Uint8Array> {
  const json = JSON.stringify(plainObject, (_k, v) => {
    if (v instanceof Uint8Array) {
      return base64Prefix + utils.toBase64(v);
    }
    return v;
  });
  return encryptionV1.serialize(encryptionV1.encrypt(key, utils.fromString(json)));
}

async function decryptObject(key: Uint8Array, ciphertext: Uint8Array): Promise<any> {
  const jsonBytes = encryptionV1.compatDecrypt(key, ciphertext);
  return JSON.parse(utils.toString(jsonBytes), (_k, v) => {
    if (typeof v === 'string' && v.startsWith(base64Prefix))
      return utils.fromBase64(v.substring(base64Prefix.length));
    return v;
  });
}

export function generateKeySafe(): KeySafe {
  return {
    deviceId: null,
    signaturePair: null,
    encryptionPair: null,
    provisionalUserKeys: {},
    devices: [],
    trustchainPublicKey: null,
    localUserKeys: null,
  };
}

export async function serializeKeySafe(keySafe: KeySafe, userSecret: Uint8Array): Promise<b64string> {
  const encrypted = await encryptObject(userSecret, keySafe);
  return utils.toBase64(encrypted);
}

export async function deserializeKeySafe(serializedSafe: b64string, userSecret: Uint8Array): Promise<KeySafe | null> {
  const encryptedSafe = utils.fromBase64(serializedSafe);
  const safe: KeySafe = await decryptObject(userSecret, encryptedSafe);

  // Validation
  if (!safe || typeof safe !== 'object') {
    throw new InternalError('Invalid key safe');
  }

  // Format upgrades
  if (!safe.deviceId) {
    return null;
  }

  return safe;
}
