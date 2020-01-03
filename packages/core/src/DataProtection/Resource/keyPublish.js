// @flow
import { tcrypto, utils, type b64string } from '@tanker/crypto';
import type { PublicProvisionalUser } from '@tanker/identity';

import { getStaticArray, unserializeGeneric } from '../../Blocks/Serialize';
import { unserializeBlock } from '../../Blocks/payloads';
import { preferredNature, type NatureKind, NATURE_KIND } from '../../Blocks/Nature';

export const KeyPublishNatures = Object.freeze({
  key_publish_to_user: 8,
  key_publish_to_user_group: 11,
  key_publish_to_provisional_user: 13,
});

export type KeyPublishNature = $Values<typeof KeyPublishNatures>;

export const SEALED_KEY_SIZE = tcrypto.SYMMETRIC_KEY_SIZE + tcrypto.SEAL_OVERHEAD;
export const OLD_ENCRYPTION_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.XCHACHA_IV_SIZE + tcrypto.MAC_SIZE + tcrypto.SEAL_OVERHEAD;
export const TWO_TIMES_SEALED_KEY_SIZE = SEALED_KEY_SIZE + tcrypto.SEAL_OVERHEAD;

export type KeyPublishRecord = {|
  recipient: Uint8Array,
  resourceId: Uint8Array,
  key: Uint8Array,
|};

export type KeyPublishToProvisionalUserRecord = {|
  recipientAppPublicKey: Uint8Array,
  recipientTankerPublicKey: Uint8Array,
  resourceId: Uint8Array,
  key: Uint8Array,
|};

type KeyPublishToSingleRecipientEntry = {|
  ...KeyPublishRecord,
  nature: number,
|};

type KeyPublishToProvisionalUserEntry = {|
  ...KeyPublishToProvisionalUserRecord,
  nature: number,
|};

export type KeyPublishEntry = KeyPublishToSingleRecipientEntry | KeyPublishToProvisionalUserEntry

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

export function serializeKeyPublishToProvisionalUser(keyPublish: KeyPublishToProvisionalUserRecord): Uint8Array {
  return utils.concatArrays(
    keyPublish.recipientAppPublicKey,
    keyPublish.recipientTankerPublicKey,
    keyPublish.resourceId,
    keyPublish.key,
  );
}

export const unserializeKeyPublish = (src: Uint8Array): KeyPublishRecord => unserializeGeneric(src, [
  (d, o) => getStaticArray(d, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE, o, 'recipient'),
  (d, o) => getStaticArray(d, tcrypto.MAC_SIZE, o, 'resourceId'),
  (d, o) => getStaticArray(d, SEALED_KEY_SIZE, o, 'key'),
]);

export const unserializeKeyPublishToProvisionalUser = (payload: Uint8Array): KeyPublishToProvisionalUserRecord => unserializeGeneric(payload, [
  (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'recipientAppPublicKey'),
  (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'recipientTankerPublicKey'),
  (d, o) => getStaticArray(d, tcrypto.MAC_SIZE, o, 'resourceId'),
  (d, o) => getStaticArray(d, TWO_TIMES_SEALED_KEY_SIZE, o, 'key'),
]);

export const getKeyPublishEntryFromBlock = (b64Block: b64string): KeyPublishEntry => {
  const block = unserializeBlock(utils.fromBase64(b64Block));
  const nature = block.nature;

  if (isKeyPublishToProvisionalUser(nature)) {
    const keyPublishRecord = unserializeKeyPublishToProvisionalUser(block.payload);
    return { ...keyPublishRecord, nature };
  }

  const keyPublishRecord = unserializeKeyPublish(block.payload);
  return { ...keyPublishRecord, nature };
};

export const makeKeyPublish = (publicEncryptionKey: Uint8Array, resourceKey: Uint8Array, resourceId: Uint8Array, nature: NatureKind) => {
  const sharedKey = tcrypto.sealEncrypt(
    resourceKey,
    publicEncryptionKey,
  );

  const payload = {
    recipient: publicEncryptionKey,
    resourceId,
    key: sharedKey,
  };

  return { payload: serializeKeyPublish(payload), nature: preferredNature(nature) };
};

export const makeKeyPublishToProvisionalUser = (publicProvisionalUser: PublicProvisionalUser, resourceKey: Uint8Array, resourceId: Uint8Array) => {
  const preEncryptedKey = tcrypto.sealEncrypt(
    resourceKey,
    publicProvisionalUser.appEncryptionPublicKey,
  );
  const encryptedKey = tcrypto.sealEncrypt(
    preEncryptedKey,
    publicProvisionalUser.tankerEncryptionPublicKey,
  );

  const payload = {
    recipientAppPublicKey: publicProvisionalUser.appSignaturePublicKey,
    recipientTankerPublicKey: publicProvisionalUser.tankerSignaturePublicKey,
    resourceId,
    key: encryptedKey,
  };

  return { payload: serializeKeyPublishToProvisionalUser(payload), nature: preferredNature(NATURE_KIND.key_publish_to_provisional_user) };
};
