// @flow
import { utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { unserializeBlock } from '../Blocks/payloads';
import { isDeviceCreation, isDeviceRevocation, deviceCreationFromBlock, deviceRevocationFromBlock } from './Serialize';
import { applyDeviceCreationToUser, applyDeviceRevocationToUser } from './User';
import { verifyDeviceCreation, verifyDeviceRevocation } from './Verify';
import { type User } from './types';

export async function usersFromBlocks(userBlocks: Array<b64string>, trustchainPublicKey: Uint8Array) {
  const userIdToUserMap: Map<b64string, User> = new Map();
  const deviceIdToUserIdMap: Map<b64string, b64string> = new Map();

  for (const b64Block of userBlocks) {
    const block = unserializeBlock(utils.fromBase64(b64Block));
    if (isDeviceCreation(block.nature)) {
      const deviceCreationEntry = deviceCreationFromBlock(block);
      const base64UserId = utils.toBase64(deviceCreationEntry.user_id);
      let user = userIdToUserMap.get(base64UserId);

      verifyDeviceCreation(deviceCreationEntry, user, trustchainPublicKey);
      user = applyDeviceCreationToUser(deviceCreationEntry, user);

      userIdToUserMap.set(base64UserId, user);
      deviceIdToUserIdMap.set(utils.toBase64(deviceCreationEntry.hash), base64UserId);
    } if (isDeviceRevocation(block.nature)) {
      const authorUserId = deviceIdToUserIdMap.get(utils.toBase64(block.author));
      if (!authorUserId) {
        throw new InternalError('no such author user id');
      }
      let user = userIdToUserMap.get(authorUserId);
      if (!user) {
        throw new InternalError('No such user');
      }
      const deviceRevocationEntry = deviceRevocationFromBlock(block, utils.fromBase64(authorUserId));
      verifyDeviceRevocation(deviceRevocationEntry, user);
      user = applyDeviceRevocationToUser(deviceRevocationEntry, user);

      userIdToUserMap.set(authorUserId, user);
    }
  }

  return { userIdToUserMap, deviceIdToUserIdMap };
}
