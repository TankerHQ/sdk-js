import { InternalError, InvalidArgument } from '@tanker/errors';
import { assertString } from '@tanker/types';
import type { b64string, Key } from './aliases';
import type { KeyMapper } from './EncryptionFormats/KeyMapper';
import { generichash } from './hash';
import * as tcrypto from './tcrypto';
import * as utils from './utils';

export type SimpleResourceId = {
  resourceId: Uint8Array;
};

export type CompositeResourceId = {
  sessionId: Uint8Array;
  resourceId: Uint8Array;
};

export const getSimpleResourceId = (data: SimpleResourceId) => data.resourceId;

const compositeVersion = 0;
const compositeResourceIdSplitPos = 1 + tcrypto.SESSION_ID_SIZE;
const compositeResourceIdSize = compositeResourceIdSplitPos + tcrypto.RESOURCE_ID_SIZE;

export const serializeCompositeResourceId = (data: CompositeResourceId): Uint8Array => utils.concatArrays(new Uint8Array([compositeVersion]), data.sessionId, data.resourceId);

export const unserializeCompositeResourceId = (id: Uint8Array): CompositeResourceId => ({
  sessionId: id.subarray(1, compositeResourceIdSplitPos),
  resourceId: id.subarray(compositeResourceIdSplitPos),
});

export const isSimpleResourceId = (resourceId: Uint8Array) => resourceId.length === tcrypto.RESOURCE_ID_SIZE;

export const isCompositeResourceId = (resourceId: Uint8Array) => resourceId.length === compositeResourceIdSize && resourceId[0] === compositeVersion;

const parseResourceId = (b64resourceId: b64string): SimpleResourceId | CompositeResourceId => {
  let resourceId: Uint8Array;
  try {
    resourceId = utils.fromBase64(b64resourceId);
  } catch (e) {
    throw new InvalidArgument('resourceId', 'resourceId is not valid base64', b64resourceId);
  }

  if (!isSimpleResourceId(resourceId) && !isCompositeResourceId(resourceId)) {
    throw new InvalidArgument('resourceId format not supported by this version of the SDK (consider upgrading)');
  }

  if (isSimpleResourceId(resourceId)) {
    return {
      resourceId,
    };
  }

  return unserializeCompositeResourceId(resourceId);
};

export function assertResourceId(arg: unknown): asserts arg is string {
  assertString(arg, 'resourceId');

  parseResourceId(arg);
}

export const deriveSessionKey = (sessionKey: Key, seed: Uint8Array): Key => generichash(utils.concatArrays(sessionKey, seed));

export function assertKey(resourceId: Uint8Array, key: Key | null): asserts key is Key {
  if (!key) {
    if (key !== null) {
      // This is a safeguard for unexpected behavior between local-storage, network and the resource coalescer:
      // We suspect that a falsy value different from null is mixed in keys somehow
      throw new InternalError(`Unreachable code during resource key look-up: ${utils.toBase64(resourceId)}, key found: ${key}`);
    }
    throw new InvalidArgument(`could not find key for resource: ${utils.toBase64(resourceId)}`);
  }
}

export const getKeyFromCompositeResourceId = async (resourceId: CompositeResourceId, keyMapper: KeyMapper) => {
  let key: Key | null = null;
  const sessionKey = await keyMapper(resourceId.sessionId);
  if (sessionKey) {
    key = deriveSessionKey(sessionKey, resourceId.resourceId);
  } else {
    key = await keyMapper(resourceId.resourceId);
  }

  assertKey(serializeCompositeResourceId(resourceId), key);
  return key;
};

export const getKeyFromResourceId = async (b64resourceId: b64string, keyMapper: KeyMapper) => {
  const resourceId = parseResourceId(b64resourceId);

  let key: Key | null = null;
  if ('sessionId' in resourceId) {
    key = await getKeyFromCompositeResourceId(resourceId, keyMapper);
  } else {
    key = await keyMapper(getSimpleResourceId(resourceId));
    assertKey(resourceId.resourceId, key);
  }

  return {
    resourceId: resourceId.resourceId,
    key,
  };
};
