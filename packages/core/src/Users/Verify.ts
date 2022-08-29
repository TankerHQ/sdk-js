import { tcrypto, utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { InvalidBlockError } from '../errors.internal';

import type { User } from './types';
import { getLastUserPublicKey } from './types';
import type { DeviceCreationEntry } from './Serialize';

import { NATURE } from '../Blocks/Nature';

export function verifyDeviceCreation(entry: DeviceCreationEntry, authorUser: User | null, trustchainId: Uint8Array, trustchainPublicKey: Uint8Array) {
  if (!utils.isNullArray(entry.last_reset))
    throw new InvalidBlockError('invalid_last_reset', 'last_reset is not null', { entry });

  const userPublicKey = authorUser ? getLastUserPublicKey(authorUser) : null;
  if (userPublicKey && entry.nature !== NATURE.device_creation_v3)
    throw new InvalidBlockError('forbidden', 'device creation version mismatch', { entry });

  if (!tcrypto.verifySignature(entry.hash, entry.signature, entry.ephemeral_public_signature_key))
    throw new InvalidBlockError('invalid_signature', 'signature is invalid', { entry });

  const delegationBuffer = utils.concatArrays(entry.ephemeral_public_signature_key, entry.user_id);

  if (authorUser) {
    const authorDevice = authorUser.devices.find(d => utils.equalArray(d.deviceId, entry.author));

    if (!authorDevice) {
      if (utils.equalArray(entry.author, trustchainId))
        throw new InvalidBlockError('invalid_author', 'a device for an existing user was signed by the trustchain key');
      throw new InternalError('Assertion error: we have an author user, but the author device did not match');
    }

    if (!tcrypto.verifySignature(delegationBuffer, entry.delegation_signature, authorDevice.devicePublicSignatureKey))
      throw new InvalidBlockError('invalid_delegation_signature', 'invalid signature from device creation author', { entry, authorDevice });

    if (entry.nature === NATURE.device_creation_v3 && userPublicKey && entry.user_key_pair
      && !utils.equalArray(entry.user_key_pair.public_encryption_key, userPublicKey))
      throw new InvalidBlockError('invalid_public_user_key', 'public_user_key is different than the author\'s one', { entry, authorDevice });

    if (!utils.equalArray(entry.user_id, authorUser.userId))
      throw new InvalidBlockError('forbidden', 'the author is not authorized to create a device for this user', { entry, authorDevice });
  } else {
    if (!utils.equalArray(entry.author, trustchainId))
      throw new InvalidBlockError('invalid_author', 'first device is not signed by the trustchain');

    if (!tcrypto.verifySignature(delegationBuffer, entry.delegation_signature, trustchainPublicKey))
      throw new InvalidBlockError('invalid_delegation_signature', 'delegation signature is invalid, there might be a mismatch between the Trustchains configured client-side and server-side', { entry });
  }
}
