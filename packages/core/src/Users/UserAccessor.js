// @flow

import { utils } from '@tanker/crypto';
import { type PublicPermanentIdentity } from '@tanker/identity';

import UserStore, { type FindUserParameters, type FindUsersParameters } from './UserStore';
import { type User } from './User';
import Trustchain from '../Trustchain/Trustchain';
import { InvalidArgument, RecipientsNotFound } from '../errors';

export type UserDevice = {|
    id: string,
    isGhostDevice: bool,
    isRevoked: bool
|}

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

  async findUser(args: FindUserParameters): Promise<?User> {
    const { userId } = args;
    if (!(userId instanceof Uint8Array))
      throw new InvalidArgument('userId', 'Uint8Array', userId);

    await this._fetchUsers([userId]);
    const user = await this._userStore.findUser(args);
    return user;
  }

  async findUserDevices(args: FindUserParameters): Promise<Array<UserDevice>> {
    const { userId } = args;
    if (!(userId instanceof Uint8Array))
      throw new InvalidArgument('userId', 'Uint8Array', userId);

    const user = await this.findUser({ userId });
    if (!user)
      throw new Error(`No such user ${utils.toString(userId)}`);

    return user.devices.map(device => ({
      id: device.deviceId,
      isGhostDevice: device.isGhostDevice,
      isRevoked: device.revokedAt !== Number.MAX_SAFE_INTEGER,
    }));
  }

  async findUsers(args: FindUsersParameters): Promise<Array<User>> {
    const { hashedUserIds } = args;
    if (!hashedUserIds)
      throw new Error('Expected hashedUserIds parameter, but was missing');

    await this._fetchUsers(hashedUserIds);

    const users = await this._userStore.findUsers(args);
    return users;
  }

  async getUsers({ publicIdentities }: { publicIdentities: Array<PublicPermanentIdentity> }): Promise<Array<User>> {
    const obfuscatedUserIds = publicIdentities.map(u => {
      if (u.target !== 'user')
        throw new Error(`Assertion error: publicIdentity ${u.target} should be 'user'`);
      return utils.fromBase64(u.value);
    });

    const fullUsers = await this.findUsers({ hashedUserIds: obfuscatedUserIds });

    if (fullUsers.length === obfuscatedUserIds.length)
      return fullUsers;

    const missingIds = [];
    for (const publicIdentity of publicIdentities) {
      const found = fullUsers.some(user => user.userId === publicIdentity.value);
      if (!found)
        missingIds.push(utils.toB64Json(publicIdentity));
    }
    throw new RecipientsNotFound(missingIds);
  }

  async getDevicePublicEncryptionKey(deviceId: Uint8Array): Promise<?Uint8Array> {
    const device = await this._userStore.findDevice({ deviceId });
    if (device)
      return device.devicePublicEncryptionKey;

    const newlyVerifiedDevice = await this._trustchain.verifyDevice(deviceId);
    if (newlyVerifiedDevice)
      return newlyVerifiedDevice.public_encryption_key;

    throw new RecipientsNotFound([utils.toBase64(deviceId)]);
  }
}
