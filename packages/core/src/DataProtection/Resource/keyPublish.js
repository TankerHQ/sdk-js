// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { getStaticArray, unserializeGeneric } from '../../Blocks/Serialize';
import { unserializeBlock } from '../../Blocks/payloads';

export const KeyPublishNatures = Object.freeze({
  key_publish_to_user: 8,
  key_publish_to_user_group: 11,
  key_publish_to_provisional_user: 13,
});

export type KeyPublishNature = $Values<typeof KeyPublishNatures>;

export const SEALED_KEY_SIZE = tcrypto.SYMMETRIC_KEY_SIZE + tcrypto.SEAL_OVERHEAD;
export const OLD_ENCRYPTION_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE + tcrypto.SEAL_OVERHEAD;
export const TWO_TIMES_SEALED_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.SEAL_OVERHEAD;

type KeyPublishAction = {|
  recipient: Uint8Array,
  resourceId: Uint8Array,
  key: Uint8Array,
|};

export type KeyPublish = {|
  ...KeyPublishAction,
  nature: KeyPublishNature,
|};

// the recipient is a Device Key
export type KeyPublishRecord = {|
  recipient: Uint8Array,
  resourceId: Uint8Array,
  key: Uint8Array,
|};

export const isKeyPublishToUser = (nature: number) => nature === KeyPublishNatures.key_publish_to_user;
export const isKeyPublishToUserGroup = (nature: number) => nature === KeyPublishNatures.key_publish_to_user_group;
export const isKeyPublishToProvisionalUser = (nature: number) => nature === KeyPublishNatures.key_publish_to_provisional_user;

export function serializeKeyPublish(keyPublish: KeyPublishRecord): Uint8Array {
  return utils.concatArrays(
    keyPublish.recipient,
    keyPublish.resourceId,
    keyPublish.key,
  );
}

export const unserializeKeyPublish = (src: Uint8Array): KeyPublishAction => unserializeGeneric(src, [
  (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'recipient'),
  (d, o) => getStaticArray(d, tcrypto.MAC_SIZE, o, 'resourceId'),
  (d, o) => getStaticArray(d, SEALED_KEY_SIZE, o, 'key'),
]);

// NOTE: We concatenate the public signature keys of the app and tanker as a single recipient field, since we don't use them separately
export const unserializeKeyPublishToProvisionalUser = (payload: Uint8Array): KeyPublishAction => unserializeGeneric(payload, [
  (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE * 2, o, 'recipient'),
  (d, o) => getStaticArray(d, tcrypto.MAC_SIZE, o, 'resourceId'),
  (d, o) => getStaticArray(d, TWO_TIMES_SEALED_KEY_SIZE, o, 'key'),
]);

export const newKeyPublish = (b64Block: b64string): KeyPublish => {
  const block = unserializeBlock(utils.fromBase64(b64Block));

  let keyPublishAction;
  switch (block.nature) {
    case KeyPublishNatures.key_publish_to_provisional_user:
      keyPublishAction = unserializeKeyPublishToProvisionalUser(block.payload);
      break;
    case KeyPublishNatures.key_publish_to_user:
    case KeyPublishNatures.key_publish_to_user_group:
      keyPublishAction = unserializeKeyPublish(block.payload);
      break;
    default:
      throw new InternalError('Assertion error: wrong type for keyPublishFromBlock');
  }

  const typeSafeNature: KeyPublishNature = (block.nature: any);
  return {
    ...keyPublishAction,
    nature: typeSafeNature,
  };
};
