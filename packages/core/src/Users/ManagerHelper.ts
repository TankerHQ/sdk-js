import type { b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import type { DeviceCreationEntry, DeviceRevocationEntry } from './Serialize';
import { isDeviceCreation, isDeviceRevocation, userEntryFromBlock } from './Serialize';
import { applyDeviceCreationToUser, applyDeviceRevocationToUser } from './User';
import { verifyDeviceCreation, verifyDeviceRevocation } from './Verify';
import type { User } from './types';

export async function usersFromBlocks(userBlocks: Array<b64string>, trustchainId: Uint8Array, trustchainPublicKey: Uint8Array) {
  const userIdToUserMap: Map<b64string, User> = new Map();
  const deviceIdToUserIdMap: Map<b64string, b64string> = new Map();
  for (const b64Block of userBlocks) {
    const userEntry = userEntryFromBlock(b64Block);

    if (isDeviceCreation(userEntry.nature)) {
      const deviceCreationEntry = ((userEntry as any) as DeviceCreationEntry);
      const base64UserId = utils.toBase64(deviceCreationEntry.user_id);
      let user = userIdToUserMap.get(base64UserId) || null;

      verifyDeviceCreation(deviceCreationEntry, user, trustchainId, trustchainPublicKey);
      user = applyDeviceCreationToUser(deviceCreationEntry, user);

      userIdToUserMap.set(base64UserId, user);
      deviceIdToUserIdMap.set(utils.toBase64(deviceCreationEntry.hash), base64UserId);
    }

    if (isDeviceRevocation(userEntry.nature)) {
      const deviceRevocationEntry = ((userEntry as any) as DeviceRevocationEntry);
      const authorUserId = deviceIdToUserIdMap.get(utils.toBase64(userEntry.author));
      if (!authorUserId) {
        throw new InternalError('no such author user id');
      }
      let user = userIdToUserMap.get(authorUserId);
      if (!user) {
        throw new InternalError('No such user');
      }
      verifyDeviceRevocation(deviceRevocationEntry, user);
      user = applyDeviceRevocationToUser(deviceRevocationEntry, user);

      userIdToUserMap.set(authorUserId, user);
    }
  }

  return { userIdToUserMap, deviceIdToUserIdMap };
}
