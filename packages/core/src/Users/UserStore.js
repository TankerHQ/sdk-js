// @flow

import { utils, type b64string } from '@tanker/crypto';
import { type DataStore } from '@tanker/datastore-base';

import { type Device, type User, applyDeviceCreationToUser, applyDeviceRevocationToUser } from './User';
import { findIndex } from '../utils';
import { NATURE, NATURE_KIND, natureKind } from '../Blocks/Nature';
import LocalUser from '../Session/LocalUser';
import { type VerifiedDeviceCreation, type VerifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';
import { type VerifiedProvisionalIdentityClaim } from '../UnverifiedStore/ProvisionalIdentityClaimUnverifiedStore';
import { type ProvisionalUserKeyPairs } from '../Session/KeySafe';

type DeviceToUser = {
  deviceId: b64string,
  userId: b64string,
};

export type FindUserParameters = {|
  userId?: Uint8Array,
  deviceId?: Uint8Array,
  userPublicKey?: Uint8Array
|}

export type FindUsersParameters = {|
  hashedUserIds?: Array<Uint8Array>,
|}

export type FindDeviceParameters = {|
  deviceId?: Uint8Array,
|}

export type FindDevicesParameters = {|
  hashedDeviceIds?: Array<Uint8Array>,
|}

const USERS_TABLE = 'users';
const DEVICES_USER_TABLE = 'devices_to_user';
const USER_KEY_TABLE = 'user_public_key_to_user';

const schemaV2 = {
  tables: [{
    name: USERS_TABLE,
    indexes: [['userId']],
  },
  {
    name: DEVICES_USER_TABLE,
    indexes: [['deviceId']],
  },
  {
    name: USER_KEY_TABLE,
    indexes: [['userPublicKey']],
  }]
};

export default class UserStore {
  _ds: DataStore<*>;
  _localUser: LocalUser;

  static schemas = [
    // this store didn't exist in schema version 1
    { version: 1, tables: [] },
    {
      version: 2,
      ...schemaV2
    },
    {
      version: 3,
      ...schemaV2
    },
    {
      version: 4,
      ...schemaV2
    },
    {
      version: 5,
      ...schemaV2
    },
    {
      version: 6,
      ...schemaV2
    },
    {
      version: 7,
      ...schemaV2
    },
  ];

  constructor(ds: DataStore<*>) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  setLocalUser = (localUser: LocalUser) => {
    this._localUser = localUser;
  }

  async applyProvisionalIdentityClaims(entries: Array<VerifiedProvisionalIdentityClaim>): Promise<Array<ProvisionalUserKeyPairs>> {
    const provisionalUserKeyPairs: Array<ProvisionalUserKeyPairs> = [];
    for (const entry of entries) {
      if (utils.equalArray(entry.user_id, this._localUser.userId)) {
        const provisionalUserKeyPair = await this._localUser.applyProvisionalIdentityClaim(entry);
        provisionalUserKeyPairs.push(provisionalUserKeyPair);
      }
    }
    return provisionalUserKeyPairs;
  }

  // all entries are verified
  async applyEntry(entry: VerifiedDeviceCreation | VerifiedDeviceRevocation): Promise<User> {
    const updatedUsers = await this.applyEntries([entry]);
    return updatedUsers[0];
  }

  // all entries are verified
  async applyEntries(entries: Array<VerifiedDeviceCreation | VerifiedDeviceRevocation>): Promise<Array<User>> {
    const toBeStored = {
      [USERS_TABLE]: [],
      [DEVICES_USER_TABLE]: [],
      [USER_KEY_TABLE]: [],
    };
    const updatedUsers: Array<User> = [];
    for (const entry of entries) {
      const storeableEntry = await this._prepareEntry(entry);

      if (utils.equalArray(entry.user_id, this._localUser.userId)) {
        if (natureKind(entry.nature) === NATURE_KIND.device_creation) {
        // $FlowIKnow Type is checked by the switch
          const deviceEntry: VerifiedDeviceCreation = entry;
          await this._localUser.applyDeviceCreation(deviceEntry);
        } else if (entry.user_keys) {
        // $FlowIKnow Type is checked by the switch
          const deviceEntry: VerifiedDeviceRevocation = entry;
          await this._localUser.applyDeviceRevocation(deviceEntry);
        }
      }

      if (storeableEntry[USERS_TABLE]) {
        toBeStored[USERS_TABLE].push(storeableEntry[USERS_TABLE]);
        updatedUsers.push(storeableEntry[USERS_TABLE]);
      }
      if (storeableEntry[DEVICES_USER_TABLE])
        toBeStored[DEVICES_USER_TABLE].push(storeableEntry[DEVICES_USER_TABLE]);
      if (storeableEntry[USER_KEY_TABLE])
        toBeStored[USER_KEY_TABLE].push(storeableEntry[USER_KEY_TABLE]);
    }

    await this._ds.bulkPut(USERS_TABLE, toBeStored[USERS_TABLE]);
    await this._ds.bulkPut(DEVICES_USER_TABLE, toBeStored[DEVICES_USER_TABLE]);
    await this._ds.bulkPut(USER_KEY_TABLE, toBeStored[USER_KEY_TABLE]);
    return updatedUsers;
  }

  async _prepareEntry(entry: VerifiedDeviceCreation | VerifiedDeviceRevocation) {
    switch (entry.nature) {
      case NATURE.device_creation_v1:
      case NATURE.device_creation_v2:
      case NATURE.device_creation_v3: {
        // $FlowIKnow Type is checked by the switch
        const deviceEntry: VerifiedDeviceCreation = entry;
        return this._prepareDeviceCreation(deviceEntry);
      }
      case NATURE.device_revocation_v1:
      case NATURE.device_revocation_v2: {
        // $FlowIKnow Type is checked by the switch
        const revocationEntry: VerifiedDeviceRevocation = entry;
        return this._prepareDeviceRevocation(revocationEntry);
      }
      default:
        throw new Error(`Invalid nature: ${entry.nature}`);
    }
  }

  async _prepareDeviceCreation(deviceCreation: VerifiedDeviceCreation) {
    const b64Id = utils.toBase64(deviceCreation.user_id);
    const existing = await this.findUser({ userId: deviceCreation.user_id });
    const { updatedUser, newDevice } = applyDeviceCreationToUser(deviceCreation, existing);
    const deviceToUser = {
      _id: newDevice.deviceId,
      deviceId: newDevice.deviceId,
      userId: b64Id,
      isGhostDevice: newDevice.isGhostDevice,
    };

    const storeableEntry: Object = {
      [USERS_TABLE]: updatedUser,
      [DEVICES_USER_TABLE]: deviceToUser,
    };

    if (deviceCreation.user_key_pair) {
      const userPublicKey = utils.toBase64(deviceCreation.user_key_pair.public_encryption_key);
      const userPublicKeyToUser = {
        _id: userPublicKey,
        userPublicKey,
        userId: b64Id,
      };
      storeableEntry[USER_KEY_TABLE] = userPublicKeyToUser;
    }
    return storeableEntry;
  }

  async _prepareDeviceRevocation(deviceRevocation: VerifiedDeviceRevocation) {
    if (!deviceRevocation.user_id) {
      throw new Error('Missing user_id in the record');
    }

    const user = await this.findUser({ userId: deviceRevocation.user_id });
    if (!user)
      throw new Error('User not found!');

    const { updatedUser, userPublicKey } = applyDeviceRevocationToUser(deviceRevocation, user);

    const storeableEntry: Object = {
      [USERS_TABLE]: updatedUser,
    };
    if (userPublicKey) {
      const b64UserPublicKey = utils.toBase64(userPublicKey);
      const userPublicKeyToUser = {
        _id: b64UserPublicKey,
        userPublicKey: b64UserPublicKey,
        userId: user.userId,
      };
      storeableEntry[USER_KEY_TABLE] = userPublicKeyToUser;
    }
    return storeableEntry;
  }

  async findUser(args: FindUserParameters): Promise<?User> {
    const { userId, deviceId, userPublicKey } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findUser: expected exactly one argument, got ${Object.keys(args).length}`);

    if (userId) {
      const record = await this._ds.first(USERS_TABLE, {
        selector: { userId: utils.toBase64(userId) },
      });
      return record;
    }

    if (deviceId) {
      const deviceToUser = await this._findDeviceToUser({ deviceId });
      if (!deviceToUser)
        return null;
      const deviceUserId = deviceToUser.userId;
      return this.findUser({ userId: utils.fromBase64(deviceUserId) });
    }

    if (userPublicKey) {
      const publicKeyToUser = await this._ds.first(USER_KEY_TABLE, {
        selector: { userPublicKey: utils.toBase64(userPublicKey) },
      });
      if (!publicKeyToUser)
        return null;
      const keyUserId = publicKeyToUser.userId;
      return this.findUser({ userId: utils.fromBase64(keyUserId) });
    }

    throw new Error('Find: invalid argument');
  }

  async findUsers(args: FindUsersParameters): Promise<Array<User>> {
    const { hashedUserIds } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findUsers: expected exactly one argument, got ${Object.keys(args).length}`);

    if (!hashedUserIds)
      throw new Error('Find: invalid argument');

    const b64HashedUserIds = hashedUserIds.map(id => utils.toBase64(id));
    return this._ds.find(USERS_TABLE, {
      selector: {
        userId: { $in: b64HashedUserIds },
      },
    });
  }

  _findDeviceToUser = async (args: FindDeviceParameters): Promise<?DeviceToUser> => {
    const { deviceId } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findUserDeviceToUser: expected exactly one argument, got ${Object.keys(args).length}`);

    if (deviceId) {
      const record = await this._ds.first(DEVICES_USER_TABLE, {
        selector: { deviceId: utils.toBase64(deviceId) },
      });
      return record;
    } else {
      throw new Error('Find: invalid argument');
    }
  }

  _findDevicesToUsers = async (args: FindDevicesParameters): Promise<Array<DeviceToUser>> => {
    const { hashedDeviceIds } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findDevicesToUsers: expected exactly one argument, got ${Object.keys(args).length}`);

    if (hashedDeviceIds) {
      return this._ds.find(DEVICES_USER_TABLE, {
        selector: {
          deviceId: { $in: hashedDeviceIds.map(utils.toBase64) }
        }
      });
    } else {
      throw new Error('Find: invalid argument');
    }
  }

  findDevice = async (args: FindDeviceParameters): Promise<?Device> => {
    const deviceToUser = await this._findDeviceToUser(args);
    if (!deviceToUser)
      return null;
    const { deviceId, userId } = deviceToUser;
    const user = await this.findUser({ userId: utils.fromBase64(userId) });
    if (!user)
      throw new Error('Find: no such userId'); // not supposed to be trigerred (here for flow)
    const deviceIndex = findIndex(user.devices, (d) => d.deviceId === deviceId);
    if (deviceIndex === -1)
      throw new Error('Device not found!');
    return user.devices[deviceIndex];
  }

  findDevices = async (args: FindDevicesParameters): Promise<Map<b64string, Device>> => {
    const devicesToUsers = await this._findDevicesToUsers(args);
    const users = await this.findUsers({ hashedUserIds: devicesToUsers.map((e) => utils.fromBase64(e.userId)) });
    const devicesToUsersMap = users.reduce((map, user) => {
      for (const device of user.devices)
        map.set(device.deviceId, user);
      return map;
    }, new Map());

    const devices = devicesToUsers.reduce((map, elem) => {
      const user = devicesToUsersMap.get(elem.deviceId);
      if (!user)
        return map;
      const deviceIndex = findIndex(user.devices, (d) => d.deviceId === elem.deviceId);
      if (deviceIndex === -1)
        throw new Error('Device not found!');
      const device = user.devices[deviceIndex];
      map.set(device.deviceId, device);
      return map;
    }, new Map());
    return devices;
  }
}
