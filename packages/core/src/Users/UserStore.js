// @flow
import find from 'array-find';

import { utils, type b64string } from '@tanker/crypto';
import { type DataStore } from '@tanker/datastore-base';
import { InternalError } from '@tanker/errors';


import type { User, Device } from './types';
import { applyDeviceCreationToUser, applyDeviceRevocationToUser } from './User';
import { findIndex } from '../utils';

import { NATURE, NATURE_KIND, natureKind } from '../Blocks/Nature';
import type { VerifiedProvisionalIdentityClaim } from '../Blocks/entries';
import type { DeviceCreationEntry, DeviceRevocationEntry, UserEntry } from './Serialize';

import type { ProvisionalUserKeyPairs } from '../Session/KeySafe';

type DeviceToUser = {
  deviceId: b64string,
  userId: b64string,
};

export type FindUserParameters = $Exact<{ deviceId: Uint8Array }> | $Exact<{ userId: Uint8Array }> | $Exact<{ userPublicKey: Uint8Array }>;
export type FindUsersParameters = $Exact<{ hashedUserIds: Array<Uint8Array> }>;
export type FindDeviceParameters = $Exact<{ deviceId: Uint8Array }>;

export type Callbacks = {
  deviceCreation: (entry: DeviceCreationEntry) => Promise<void>,
  deviceRevocation: (entry: DeviceRevocationEntry) => Promise<void>,
  claim: (entry: VerifiedProvisionalIdentityClaim) => Promise<ProvisionalUserKeyPairs>,
};

function recordFromUser(user: User) {
  const b64UserId = utils.toBase64(user.userId);
  return { ...user, userId: b64UserId, _id: b64UserId };
}
function userFromRecord(record: any): User {
  return { ...record, userId: utils.fromBase64(record.userId) };
}

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
  /*:: _ds: DataStore<*>; */
  _callbacks: Callbacks;
  _userId: Uint8Array;

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
    {
      version: 8,
      ...schemaV2
    },
  ];

  constructor(ds: DataStore<*>, userId: Uint8Array) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    this._userId = userId;
  }

  setCallbacks = (callbacks: Callbacks) => {
    this._callbacks = callbacks;
  }

  async applyProvisionalIdentityClaims(entries: Array<VerifiedProvisionalIdentityClaim>): Promise<Array<ProvisionalUserKeyPairs>> {
    const provisionalUserKeyPairs: Array<ProvisionalUserKeyPairs> = [];
    for (const entry of entries) {
      if (utils.equalArray(entry.user_id, this._userId)) {
        const provisionalUserKeyPair = await this._callbacks.claim(entry);
        provisionalUserKeyPairs.push(provisionalUserKeyPair);
      }
    }
    return provisionalUserKeyPairs;
  }

  // all entries are verified
  async applyEntry(entry: UserEntry): Promise<User> {
    const updatedUsers = await this.applyEntries([entry]);
    return updatedUsers[0];
  }

  // all entries are verified
  async applyEntries(entries: Array<UserEntry>): Promise<Array<User>> {
    const updatedUsers: Array<User> = [];
    for (const entry of entries) {
      if (utils.equalArray(entry.user_id, this._userId)) {
        if (natureKind(entry.nature) === NATURE_KIND.device_creation) {
        // $FlowIKnow Type is checked by the switch
          const deviceEntry: VerifiedDeviceCreation = entry;
          await this._callbacks.deviceCreation(deviceEntry);
        } else if (entry.user_keys) {
        // $FlowIKnow Type is checked by the switch
          const deviceEntry: VerifiedDeviceRevocation = entry;
          await this._callbacks.deviceRevocation(deviceEntry);
        }
      }

      updatedUsers.push(await this._applyEntrytoUser(entry));
    }
    await this.storeUsers(updatedUsers);

    return updatedUsers;
  }

  async _applyEntrytoUser(entry: UserEntry): Promise<User> {
    const existingUser = await this.findUser({ userId: entry.user_id });

    switch (entry.nature) {
      case NATURE.device_creation_v1:
      case NATURE.device_creation_v2:
      case NATURE.device_creation_v3: {
        // $FlowIKnow Type is checked by the switch
        const deviceEntry: VerifiedDeviceCreation = entry;
        return applyDeviceCreationToUser(deviceEntry, existingUser);
      }
      case NATURE.device_revocation_v1:
      case NATURE.device_revocation_v2: {
        if (!existingUser)
          throw new InternalError('User not found!');
        // $FlowIKnow Type is checked by the switch
        const revocationEntry: VerifiedDeviceRevocation = entry;
        return applyDeviceRevocationToUser(revocationEntry, existingUser);
      }
      default:
        throw new InternalError(`Invalid nature: ${entry.nature}`);
    }
  }

  async storeUsers(users: Array<User>) {
    const userRecordsToInsert = [];
    const userPublicKeysRecordsToInsert = [];
    const deviceUserRecordsToInsert = [];

    users.forEach(async user => {
      const b64UserId = utils.toBase64(user.userId);
      userRecordsToInsert.push(recordFromUser(user));

      user.userPublicKeys.forEach(uk => {
        const b64UserPublicKey = utils.toBase64(uk.userPublicKey);
        userPublicKeysRecordsToInsert.push({
          _id: b64UserPublicKey,
          userPublicKey: b64UserPublicKey,
          userId: b64UserId,
        });
      });

      user.devices.forEach(d => {
        const b64DeviceId = utils.toBase64(d.deviceId);
        deviceUserRecordsToInsert.push({
          _id: b64DeviceId,
          deviceId: b64DeviceId,
          userId: b64UserId,
          isGhostDevice: d.isGhostDevice,
        });
      });
    });

    const promises = [];
    promises.push(this._ds.bulkPut(USERS_TABLE, userRecordsToInsert));
    promises.push(this._ds.bulkPut(USER_KEY_TABLE, userPublicKeysRecordsToInsert));
    promises.push(this._ds.bulkPut(DEVICES_USER_TABLE, deviceUserRecordsToInsert));

    return Promise.all(promises);
  }

  async findUsers(userIds: Array<Uint8Array>): Promise<Array<User>> {
    const b64HashedUserIds = userIds.map(id => utils.toBase64(id));
    const result = await this._ds.find(USERS_TABLE, {
      selector: {
        userId: { $in: b64HashedUserIds },
      },
    });
    return result.map(userFromRecord);
  }

  async findUser(args: FindUserParameters) {
    if (Object.keys(args).length !== 1)
      throw new InternalError(`findUser: expected exactly one argument, got ${Object.keys(args).length}`);

    if (args.userId) {
      const b64UserId = utils.toBase64(args.userId);
      const record = await this._ds.first(USERS_TABLE, {
        selector: { userId: { $eq: b64UserId } },
      });
      return record && userFromRecord(record);
    }

    if (args.deviceId) {
      const deviceToUser = await this._findDeviceToUser({ deviceId: args.deviceId });
      if (!deviceToUser)
        return null;
      const deviceUserId = deviceToUser.userId;
      return this.findUser({ userId: utils.fromBase64(deviceUserId) });
    }

    if (args.userPublicKey) {
      const publicKeyToUser = await this._ds.first(USER_KEY_TABLE, {
        selector: { userPublicKey: { $eq: utils.toBase64(args.userPublicKey) } },
      });
      if (!publicKeyToUser)
        return null;
      const keyUserId = publicKeyToUser.userId;
      return this.findUser({ userId: utils.fromBase64(keyUserId) });
    }

    throw new InternalError('Find: invalid argument');
  }

  _findDeviceToUser = async (args: FindDeviceParameters): Promise<?DeviceToUser> => {
    const { deviceId } = args;
    if (Object.keys(args).length !== 1)
      throw new InternalError(`findUserDeviceToUser: expected exactly one argument, got ${Object.keys(args).length}`);

    if (deviceId) {
      const record = await this._ds.first(DEVICES_USER_TABLE, {
        selector: { deviceId: utils.toBase64(deviceId) },
      });
      return record;
    }

    throw new InternalError('Find: invalid argument');
  }

  findDevice = async (args: FindDeviceParameters): Promise<?Device> => {
    const deviceToUser = await this._findDeviceToUser(args);
    if (!deviceToUser)
      return null;
    const { deviceId, userId } = deviceToUser;
    const user = await this.findUser({ userId: utils.fromBase64(userId) });
    if (!user)
      throw new InternalError('Assertion error: Find: no such userId'); // not supposed to be trigerred (here for flow)
    const deviceIndex = findIndex(user.devices, (d) => utils.toBase64(d.deviceId) === deviceId);
    if (deviceIndex === -1)
      throw new InternalError('Assertion error: Device not found!');
    return user.devices[deviceIndex];
  }

  findDevices = async (deviceIds: Array<Uint8Array>): Promise<Map<b64string, Device>> => {
    const records = await this._ds.find(DEVICES_USER_TABLE, {
      selector: {
        deviceId: { $in: deviceIds.map(utils.toBase64) }
      }
    });

    const users = await this.findUsers(records.map((e) => utils.fromBase64(e.userId)));

    const devicesMap = new Map<b64string, Device>();

    users.forEach(user => {
      user.devices.forEach(device => {
        if (find(deviceIds, deviceId => utils.equalArray(deviceId, device.deviceId))) {
          devicesMap.set(utils.toBase64(device.deviceId), device);
        }
      });
    });
    return devicesMap;
  }
}
