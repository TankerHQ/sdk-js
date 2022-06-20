import type { b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';

import { isDeviceCreation, userEntryFromBlock } from './Serialize';
import { applyDeviceCreationToUser } from './User';
import { verifyDeviceCreation } from './Verify';
import type { User } from './types';

export async function usersFromBlocks(userBlocks: Array<b64string>, trustchainId: Uint8Array, trustchainPublicKey: Uint8Array) {
  const userIdToUserMap: Map<b64string, User> = new Map();
  const deviceIdToUserIdMap: Map<b64string, b64string> = new Map();
  for (const b64Block of userBlocks) {
    const userEntry = userEntryFromBlock(b64Block);

    if (isDeviceCreation(userEntry)) {
      const base64UserId = utils.toBase64(userEntry.user_id);
      let user = userIdToUserMap.get(base64UserId) || null;

      verifyDeviceCreation(userEntry, user, trustchainId, trustchainPublicKey);
      user = applyDeviceCreationToUser(userEntry, user);

      userIdToUserMap.set(base64UserId, user);
      deviceIdToUserIdMap.set(utils.toBase64(userEntry.hash), base64UserId);
    }
  }

  return { userIdToUserMap, deviceIdToUserIdMap };
}
