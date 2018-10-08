// @flow

import { utils, type b64string } from '@tanker/crypto';
import { type DataStore } from '@tanker/datastore-base';

import { findIndex } from '../utils';
import { NATURE, natureToString, NATURE_KIND, natureKind } from '../Blocks/payloads';
import KeyStore from '../Session/Keystore';
import { type VerifiedDeviceCreation, type VerifiedDeviceRevocation } from '../UnverifiedStore/UserUnverifiedStore';

export type IndexUserKey = {|
  userPublicKey: Uint8Array,
  index: number,
|};

export type Device = {
  deviceId: b64string,
  devicePublicEncryptionKey: Uint8Array,
  devicePublicSignatureKey: Uint8Array,
  isGhostDevice: bool,
  isServerDevice: bool,
  createdAt: number,
  revokedAt: number,
};

export type User = {
  userId: b64string,
  userPublicKeys: Array<IndexUserKey>,
  devices: Array<Device>, //encryption
};

export type DeviceToUser = {
  deviceId: b64string,
  userId: b64string,
};

export type UserPublicKeyToUser = {
  userPublicKey: b64string,
  userId: b64string,
}

export type FindUserParameters = {|
  hashedUserId?: Uint8Array,
|}

export type FindUsersParameters = {|
  hashedUserIds?: Array<Uint8Array>,
|}

export type FindDeviceParameters = {|
  hashedDeviceId?: Uint8Array,
|}

export type FindDevicesParameters = {|
  hashedDeviceIds?: Array<Uint8Array>,
|}

export type FindUserPublicKeyParameters = {|
  hashedUserPublicKey?: Uint8Array,
|}

export function getLastUserPublicKey(user: User): ?Uint8Array {
  if (user.userPublicKeys.length === 0)
    return;
  return user.userPublicKeys.slice(-1)[0].userPublicKey;
}

const TABLE1 = 'users';
const TABLE2 = 'devices_to_user';
const TABLE3 = 'user_public_key_to_user';

export default class UserStore {
  _ds: DataStore<*>;
  _userId: Uint8Array;
  _keyStore: KeyStore;

  static schemas = [
    // this store didn't exist in schema version 1
    { version: 1, tables: [] },
    {
      version: 2,
      tables: [{
        name: TABLE1,
        indexes: [['userId']],
      },
      {
        name: TABLE2,
        indexes: [['deviceId']],
      },
      {
        name: TABLE3,
        indexes: [['userPublicKey']],
      }]
    },
    {
      version: 3,
      tables: [{
        name: TABLE1,
        indexes: [['userId']],
      },
      {
        name: TABLE2,
        indexes: [['deviceId']],
      },
      {
        name: TABLE3,
        indexes: [['userPublicKey']],
      }]
    },
    {
      version: 4,
      tables: [{
        name: TABLE1,
        indexes: [['userId']],
      },
      {
        name: TABLE2,
        indexes: [['deviceId']],
      },
      {
        name: TABLE3,
        indexes: [['userPublicKey']],
      }]
    },
  ];

  constructor(ds: DataStore<*>, userId: Uint8Array, keyStore: KeyStore) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
    this._userId = userId;
    this._keyStore = keyStore;
  }

  static async open(ds: DataStore<*>, userId: Uint8Array, keyStore: KeyStore): Promise<UserStore> {
    return new UserStore(ds, userId, keyStore);
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
  }

  // all entries are verified
  async applyEntry(entry: VerifiedDeviceCreation | VerifiedDeviceRevocation): Promise<User> {
    const updatedUsers = await this.applyEntries([entry]);
    return updatedUsers[0];
  }

  // all entries are verified
  async applyEntries(entries: Array<VerifiedDeviceCreation | VerifiedDeviceRevocation>): Promise<Array<User>> {
    const toBeStored = {
      [TABLE1]: [],
      [TABLE2]: [],
      [TABLE3]: [],
    };
    const updatedUsers: Array<User> = [];
    for (const entry of entries) {
      const storeableEntry = await this._prepareEntry(entry);

      if (utils.equalArray(entry.user_id, this._userId)) {
        if (natureKind(entry.nature) === NATURE_KIND.device_creation) {
        // $FlowIKnow Type is checked by the switch
          const deviceEntry: VerifiedDeviceCreation = entry;
          await this._keyStore.processDeviceCreationUserKeyPair(deviceEntry.hash, deviceEntry.public_encryption_key, deviceEntry.user_key_pair);
        } else if (entry.user_keys) {
        // $FlowIKnow Type is checked by the switch
          const deviceEntry: VerifiedDeviceRevocation = entry;
          await this._keyStore.processDeviceRevocationUserKeys(deviceEntry.device_id, deviceEntry.user_keys);
        }
      }

      if (storeableEntry[TABLE1]) {
        toBeStored[TABLE1].push(storeableEntry[TABLE1]);
        updatedUsers.push(storeableEntry[TABLE1]);
      }
      if (storeableEntry[TABLE2])
        toBeStored[TABLE2].push(storeableEntry[TABLE2]);
      if (storeableEntry[TABLE3])
        toBeStored[TABLE3].push(storeableEntry[TABLE3]);
    }

    await this._ds.bulkPut(TABLE1, toBeStored[TABLE1]);
    await this._ds.bulkPut(TABLE2, toBeStored[TABLE2]);
    await this._ds.bulkPut(TABLE3, toBeStored[TABLE3]);
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
        throw new Error(`Invalid nature: ${natureToString(entry.nature)}`);
    }
  }

  async _prepareDeviceCreation(record: VerifiedDeviceCreation) {
    const b64Id = utils.toBase64(record.user_id);

    const existing = await this.findUser({ hashedUserId: record.user_id });

    let oldDevices = [];
    let userPublicKeys = record.user_key_pair ? [{ userPublicKey: record.user_key_pair.public_encryption_key, index: record.index }] : [];
    if (existing) {
      oldDevices = existing.devices;
      userPublicKeys = existing.userPublicKeys; // eslint-disable-line prefer-destructuring
    }
    const newDevice: Device = {
      deviceId: utils.toBase64(record.hash),
      devicePublicEncryptionKey: record.public_encryption_key,
      devicePublicSignatureKey: record.public_signature_key,
      createdAt: record.index,
      isGhostDevice: record.is_ghost_device,
      isServerDevice: record.is_server_device,
      revokedAt: Number.MAX_SAFE_INTEGER,
    };

    for (const existingDev of oldDevices) {
      if (existingDev.deviceId === newDevice.deviceId)
        console.warn('Assertion error: Adding an already existing device.');
    }

    const user = {
      _id: b64Id,
      userId: b64Id,
      userPublicKeys,
      devices: [...oldDevices, newDevice],
    };

    const deviceToUser = {
      _id: newDevice.deviceId,
      deviceId: newDevice.deviceId,
      userId: b64Id,
      isGhostDevice: newDevice.isGhostDevice,
      isServerDevice: newDevice.isServerDevice,
    };

    const storeableEntry: Object = {
      [TABLE1]: user,
      [TABLE2]: deviceToUser,
    };

    if (record.user_key_pair) {
      const userPublicKey = utils.toBase64(record.user_key_pair.public_encryption_key);
      const userPublicKeyToUser = {
        _id: userPublicKey,
        userPublicKey,
        userId: b64Id,
      };
      storeableEntry[TABLE3] = userPublicKeyToUser;
    }
    return storeableEntry;
  }

  async _prepareDeviceRevocation(record: VerifiedDeviceRevocation) {
    if (!record.user_id) {
      throw new Error('Missing user_id in the record');
    }

    const b64DevId = utils.toBase64(record.device_id);

    const existing = await this.findUser({ hashedUserId: record.user_id });
    if (!existing)
      throw new Error('User not found!');

    const deviceIndex = findIndex(existing.devices, (d) => d.deviceId === b64DevId);
    if (deviceIndex === -1)
      throw new Error('Device not found!');
    existing.devices[deviceIndex].revokedAt = record.index;

    const storeableEntry: Object = {
      [TABLE1]: existing,
    };
    if (record.nature !== NATURE.device_revocation_v1) {
      if (!record.user_keys)
        throw new Error('Somehow we have a DR2 without a new user key?');
      const userPublicKey = record.user_keys.public_encryption_key;
      existing.userPublicKeys.push({ userPublicKey, index: record.index });
      const b64UserPublicKey = utils.toBase64(userPublicKey);
      const userPublicKeyToUser = {
        _id: b64UserPublicKey,
        userPublicKey: b64UserPublicKey,
        userId: existing.userId,
      };
      storeableEntry[TABLE3] = userPublicKeyToUser;
    }
    return storeableEntry;
  }

  async hasDevice(userId: Uint8Array, deviceId: Uint8Array) {
    const user = await this.findUser({ hashedUserId: userId });
    if (!user)
      throw new Error('hasDevice: User not found!');

    const b64DeviceId = utils.toBase64(deviceId);
    const index = findIndex(user.devices, (d) => d.deviceId === b64DeviceId);
    return index !== -1;
  }

  async findUser(args: FindUserParameters): Promise<?User> {
    const { hashedUserId } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findUser: expected exactly one argument, got ${Object.keys(args).length}`);

    if (hashedUserId) {
      const record = await this._ds.first(TABLE1, {
        selector: { userId: utils.toBase64(hashedUserId) },
      });
      return record;
    } else {
      throw new Error('Find: invalid argument');
    }
  }

  async findUsers(args: FindUsersParameters): Promise<Array<User>> {
    const { hashedUserIds } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findUsers: expected exactly one argument, got ${Object.keys(args).length}`);

    if (!hashedUserIds)
      throw new Error('Find: invalid argument');

    const b64HashedUserIds = hashedUserIds.map(id => utils.toBase64(id));
    return this._ds.find(TABLE1, {
      selector: {
        userId: { $in: b64HashedUserIds },
      },
    });
  }

  findDeviceToUser = async (args: FindDeviceParameters): Promise<?DeviceToUser> => {
    const { hashedDeviceId } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findUserDeviceToUser: expected exactly one argument, got ${Object.keys(args).length}`);

    if (hashedDeviceId) {
      const record = await this._ds.first(TABLE2, {
        selector: { deviceId: utils.toBase64(hashedDeviceId) },
      });
      return record;
    } else {
      throw new Error('Find: invalid argument');
    }
  }

  findDevicesToUsers = async (args: FindDevicesParameters): Promise<Array<DeviceToUser>> => {
    const { hashedDeviceIds } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findDevicesToUsers: expected exactly one argument, got ${Object.keys(args).length}`);

    if (hashedDeviceIds) {
      return this._ds.find(TABLE2, {
        selector: {
          deviceId: { $in: hashedDeviceIds.map(utils.toBase64) }
        }
      });
    } else {
      throw new Error('Find: invalid argument');
    }
  }

  findDevice = async (args: FindDeviceParameters): Promise<?Device> => {
    const deviceToUser = await this.findDeviceToUser(args);
    if (!deviceToUser)
      return null;
    const { deviceId, userId } = deviceToUser;
    const user = await this.findUser({ hashedUserId: utils.fromBase64(userId) });
    if (!user)
      throw new Error('Find: no such userId'); // not supposed to be trigerred (here for flow)
    const deviceIndex = findIndex(user.devices, (d) => d.deviceId === deviceId);
    if (deviceIndex === -1)
      throw new Error('Device not found!');
    return user.devices[deviceIndex];
  }

  findDevices = async (args: FindDevicesParameters): Promise<Map<b64string, Device>> => {
    const devicesToUsers = await this.findDevicesToUsers(args);
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

  findUserByUserPublicKey = async (args: FindUserPublicKeyParameters): Promise<?User> => {
    const { hashedUserPublicKey } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findUserByUserPublicKey: expected exactly one argument, got ${Object.keys(args).length}`);

    if (!hashedUserPublicKey)
      throw new Error('Find: invalid argument');

    const record = await this._ds.first(TABLE3, {
      selector: { userPublicKey: utils.toBase64(hashedUserPublicKey) },
    });
    if (!record)
      return;
    return this.findUser({ hashedUserId: utils.fromBase64(record.userId) });
  }
}
