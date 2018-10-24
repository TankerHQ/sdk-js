// @flow

import varint from 'varint';

import { ResourceManager } from '../Resource/ResourceManager';
import { concatArrays } from '../Blocks/Serialize';

export type EncryptionResult = {
  key: Uint8Array,
  resourceId: Uint8Array,
  encryptedData: Uint8Array,
};

export async function encryptData(plain: Uint8Array): Promise<EncryptionResult> {
  const { key, resourceId, encryptedData, version } = await ResourceManager.makeResource(plain);
  const encodedVersion = varint.encode(version);
  return { key, resourceId, encryptedData: concatArrays(encodedVersion, encryptedData) };
}
