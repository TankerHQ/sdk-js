// @flow
import find from 'array-find';

import { utils, type b64string } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import { type PublicPermanentIdentity } from '@tanker/identity';

import { unserializeBlock } from '../Blocks/payloads';
import { isDeviceCreation, isDeviceRevocation, deviceCreationFromBlock, deviceRevocationFromBlock } from './Serialize';
import { applyDeviceCreationToUser, applyDeviceRevocationToUser } from './User';
import { verifyDeviceCreation, verifyDeviceRevocation } from './Verify';

import { Client, b64RequestObject } from '../Network/Client';
import { type User } from './types';
import Trustchain from '../Trustchain/Trustchain';
import LocalUser from '../Session/LocalUser/LocalUser';

// ensure that the UserStore is always up-to-date before requesting it.
export default class UserAccessor {
  _client: Client;
  _localUser: LocalUser;
  _trustchain: Trustchain;

  constructor(client: Client, localUser: LocalUser) {
    this._client = client;
    this._localUser = localUser;
  }

  async findUser(userId: Uint8Array) {
    const blocks = await this._getUserBlocksByUserIds([userId]);
    const { userIdToUserMap } = await this._usersFromBlocks(blocks);
    return userIdToUserMap.get(utils.toBase64(userId));
  }

  async findUsers(hashedUserIds: Array<Uint8Array>): Promise<Array<User>> {
    if (!hashedUserIds)
      throw new InternalError('Expected hashedUserIds parameter, but was missing');

    if (!hashedUserIds.length) {
      return [];
    }
    const blocks = await this._getUserBlocksByUserIds(hashedUserIds);
    const { userIdToUserMap } = await this._usersFromBlocks(blocks);
    return Array.from(userIdToUserMap.values());
  }

  async getUsers({ publicIdentities }: { publicIdentities: Array<PublicPermanentIdentity> }): Promise<Array<User>> {
    const obfuscatedUserIds = publicIdentities.map(u => {
      if (u.target !== 'user')
        throw new InternalError(`Assertion error: publicIdentity ${u.target} should be 'user'`);
      return utils.fromBase64(u.value);
    });

    const fullUsers = await this.findUsers(obfuscatedUserIds);

    if (fullUsers.length === obfuscatedUserIds.length)
      return fullUsers;

    const invalidPublicIdentities = [];
    for (const publicIdentity of publicIdentities) {
      const found = fullUsers.some(user => user.userId === publicIdentity.value);
      if (!found)
        invalidPublicIdentities.push(utils.toB64Json(publicIdentity));
    }

    const message = `The following identities are invalid or do not exist on the trustchain: "${invalidPublicIdentities.join('", "')}"`;
    throw new InvalidArgument(message);
  }

  async getDeviceKeysByDevicesIds(devicesIds: Array<Uint8Array>) {
    const blocks = await this._getUserBlocksByDeviceIds(devicesIds);

    const { userIdToUserMap, deviceIdToUserIdMap } = await this._usersFromBlocks(blocks);
    return this._getDeviceKeysFromIds(userIdToUserMap, deviceIdToUserIdMap, devicesIds);
  }

  _getDeviceKeysFromIds(userIdToUserMap: Map<b64string, User>, deviceIdToUserIdMap: Map<b64string, b64string>, devicesIds: Array<Uint8Array>): Map<b64string, Uint8Array> {
    const devicesPublicSignatureKeys: Map<b64string, Uint8Array> = new Map();
    for (const deviceId of devicesIds) {
      const userId = deviceIdToUserIdMap.get(utils.toBase64(deviceId));
      if (!userId) {
        throw new InternalError('no such author user id');
      }
      const user = userIdToUserMap.get(userId);
      if (!user) {
        throw new InternalError('no such author user');
      }
      const device = find(user.devices, userDevice => utils.equalArray(userDevice.deviceId, deviceId));
      devicesPublicSignatureKeys.set(utils.toBase64(deviceId), device.devicePublicSignatureKey);
    }
    return devicesPublicSignatureKeys;
  }

  async _usersFromBlocks(userBlocks: Array<b64string>) {
    const userIdToUserMap: Map<b64string, User> = new Map();
    const deviceIdToUserIdMap: Map<b64string, b64string> = new Map();

    for (const b64Block of userBlocks) {
      const block = unserializeBlock(utils.fromBase64(b64Block));
      if (isDeviceCreation(block.nature)) {
        const deviceCreationEntry = deviceCreationFromBlock(block);
        const base64UserId = utils.toBase64(deviceCreationEntry.user_id);
        let user = userIdToUserMap.get(base64UserId);

        verifyDeviceCreation(deviceCreationEntry, user, this._localUser.trustchainPublicKey);
        user = applyDeviceCreationToUser(deviceCreationEntry, user);

        userIdToUserMap.set(base64UserId, user);
        deviceIdToUserIdMap.set(utils.toBase64(deviceCreationEntry.hash), base64UserId);
      } if (isDeviceRevocation(block.nature)) {
        const authorUserId = deviceIdToUserIdMap.get(utils.toBase64(block.author));
        if (!authorUserId) {
          throw new InternalError('can\'t find author device id for revocation');
        }
        let user = userIdToUserMap.get(authorUserId);
        if (!user) {
          throw new InternalError('can\'t find author device for revocation');
        }
        const deviceRevocationEntry = deviceRevocationFromBlock(block, utils.fromBase64(authorUserId));
        verifyDeviceRevocation(deviceRevocationEntry, user);
        user = applyDeviceRevocationToUser(deviceRevocationEntry, user);

        userIdToUserMap.set(authorUserId, user);
      }
    }

    return { userIdToUserMap, deviceIdToUserIdMap };
  }

  _getUserBlocksByUserIds(userIds: Array<Uint8Array>) {
    const request = {
      user_ids: userIds,
    };

    return this._client.send('get users blocks', b64RequestObject(request));
  }

  _getUserBlocksByDeviceIds(deviceIds: Array<Uint8Array>) {
    const request = {
      device_ids: deviceIds,
    };

    return this._client.send('get users blocks', b64RequestObject(request));
  }
}
