// @flow
import find from 'array-find';

import { utils } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import { type PublicPermanentIdentity } from '@tanker/identity';

import UserStore, { type FindUsersParameters } from './UserStore';
import { type User } from './types';
import Trustchain from '../Trustchain/Trustchain';

// ensure that the UserStore is always up-to-date before requesting it.
export default class UserAccessor {
  _userStore: UserStore;
  _trustchain: Trustchain;
  _trustchainId: Uint8Array;
  _userId: Uint8Array;

  constructor(userStore: UserStore, trustchainAPI: Trustchain, trustchainId: Uint8Array, userId: Uint8Array) {
    this._userStore = userStore;
    this._trustchain = trustchainAPI;
    this._trustchainId = trustchainId;
    this._userId = userId;
  }

  async _fetchUsers(userIds: Array<Uint8Array>) {
    const userIdsWithoutMe = userIds.filter(u => !utils.equalArray(u, this._userId));
    if (userIdsWithoutMe.length !== 0)
      await this._trustchain.sync(userIdsWithoutMe, []);
    await this._trustchain.updateUserStore(userIdsWithoutMe);
  }

  async findUser(userId: Uint8Array) {
    await this._fetchUsers([userId]);
    return this._userStore.findUser({ userId });
  }

  async findUserByDeviceId(args: $Exact<{ deviceId: Uint8Array }>): Promise<?User> {
    const { deviceId } = args;

    if (!(deviceId instanceof Uint8Array))
      throw new InvalidArgument('deviceId', 'Uint8Array', deviceId);

    return this._userStore.findUser(args);
  }

  async findUsers(args: FindUsersParameters): Promise<Array<User>> {
    const { hashedUserIds } = args;
    if (!hashedUserIds)
      throw new InternalError('Expected hashedUserIds parameter, but was missing');

    await this._fetchUsers(hashedUserIds);

    return this._userStore.findUsers(hashedUserIds);
  }

  async getUsers({ publicIdentities }: { publicIdentities: Array<PublicPermanentIdentity> }): Promise<Array<User>> {
    const obfuscatedUserIds = publicIdentities.map(u => {
      if (u.target !== 'user')
        throw new InternalError(`Assertion error: publicIdentity ${u.target} should be 'user'`);
      return utils.fromBase64(u.value);
    });

    const fullUsers = await this.findUsers({ hashedUserIds: obfuscatedUserIds });

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

  async fetchDeviceByDeviceId(deviceId: Uint8Array, groupId: ?Uint8Array) {
    let user = await this.findUserByDeviceId({ deviceId });
    if (!user) {
      if (groupId) {
        await this._trustchain.sync([], [groupId]);
      } else {
        await this._trustchain.sync([], []);
      }
      user = await this.findUserByDeviceId({ deviceId });
      if (!user) {
        throw new InternalError('Assertion error: unknown user');
      }
    }
    const device = find(user.devices, d => utils.equalArray(d.deviceId, deviceId));
    if (!device) {
      throw new InternalError('Assertion error: device not found');
    }
    return device.devicePublicSignatureKey;
  }
}
