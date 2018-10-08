// @flow

import { utils, type b64string } from '@tanker/crypto';
import { errors as dbErrors, type DataStore } from '@tanker/datastore-base';
import { type Group, type ExternalGroup } from './types';

type DbGroup = {|
  _id: b64string,
  publicSignatureKey: b64string,
  privateSignatureKey: ?b64string,
  publicEncryptionKey: b64string,
  privateEncryptionKey: ?b64string,
  encryptedPrivateSignatureKey: ?b64string,
  lastGroupBlock: b64string,
  index: number,
|};

function groupToDbGroup(group: Group): DbGroup {
  return {
    _id: utils.toBase64(group.groupId),
    publicSignatureKey: utils.toBase64(group.signatureKeyPair.publicKey),
    privateSignatureKey: utils.toBase64(group.signatureKeyPair.privateKey),
    publicEncryptionKey: utils.toBase64(group.encryptionKeyPair.publicKey),
    privateEncryptionKey: utils.toBase64(group.encryptionKeyPair.privateKey),
    encryptedPrivateSignatureKey: null,
    lastGroupBlock: utils.toBase64(group.lastGroupBlock),
    index: group.index,
  };
}

function externalGroupToDbGroup(group: ExternalGroup): DbGroup {
  if (!group.encryptedPrivateSignatureKey)
    throw new Error('Assertion error: trying to add external group without encrypted private signature key');

  return {
    _id: utils.toBase64(group.groupId),
    publicSignatureKey: utils.toBase64(group.publicSignatureKey),
    privateSignatureKey: null,
    publicEncryptionKey: utils.toBase64(group.publicEncryptionKey),
    privateEncryptionKey: null,
    // $FlowIKnow already checked for nullity
    encryptedPrivateSignatureKey: utils.toBase64(group.encryptedPrivateSignatureKey),
    lastGroupBlock: utils.toBase64(group.lastGroupBlock),
    index: group.index,
  };
}

function dbGroupToGroup(group: DbGroup): Group {
  if (!group.privateSignatureKey || !group.privateEncryptionKey)
    throw new Error(`no private key found for group ${group.publicSignatureKey}`);

  return {
    groupId: utils.fromBase64(group._id), // eslint-disable-line no-underscore-dangle
    signatureKeyPair: {
      publicKey: utils.fromBase64(group.publicSignatureKey),
      // $FlowIssue I already checked for nullity
      privateKey: utils.fromBase64(group.privateSignatureKey),
    },
    encryptionKeyPair: {
      publicKey: utils.fromBase64(group.publicEncryptionKey),
      // $FlowIssue I already checked for nullity
      privateKey: utils.fromBase64(group.privateEncryptionKey),
    },
    lastGroupBlock: utils.fromBase64(group.lastGroupBlock),
    index: group.index,
  };
}

function dbGroupToExternalGroup(group: DbGroup): ExternalGroup {
  return {
    groupId: utils.fromBase64(group._id), // eslint-disable-line no-underscore-dangle
    publicSignatureKey: utils.fromBase64(group.publicSignatureKey),
    publicEncryptionKey: utils.fromBase64(group.publicEncryptionKey),
    encryptedPrivateSignatureKey: group.encryptedPrivateSignatureKey ? utils.fromBase64(group.encryptedPrivateSignatureKey) : null,
    lastGroupBlock: utils.fromBase64(group.lastGroupBlock),
    index: group.index,
  };
}

const GROUPS_TABLE = 'groups';

export default class GroupStore {
  _ds: DataStore<*>;

  static schemas = [
    // this store didn't exist in schema version 1 and 2
    { version: 1, tables: [] },
    { version: 2, tables: [] },
    {
      version: 3,
      tables: [{
        name: GROUPS_TABLE,
        indexes: [['publicEncryptionKey']],
      }]
    },
    {
      version: 4,
      tables: [{
        name: GROUPS_TABLE,
        indexes: [['publicEncryptionKey']],
      }]
    },
  ];

  constructor(ds: DataStore<*>) {
    // _ properties won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  static async open(ds: DataStore<*>): Promise<GroupStore> {
    return new GroupStore(ds);
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
  }

  async updateLastGroupBlock(args: { groupId: Uint8Array, currentLastGroupBlock: Uint8Array }) {
    const record = await this._findDbGroup(args.groupId);
    if (!record)
      throw new Error(`updateLastGroupBlock: could not find group ${utils.toBase64(args.groupId)}`);

    record.lastGroupBlock = utils.toBase64(args.currentLastGroupBlock);
    await this._ds.put(GROUPS_TABLE, record);
  }

  async putExternal(group: ExternalGroup): Promise<void> {
    await this._ds.put(GROUPS_TABLE, externalGroupToDbGroup(group));
  }

  async put(group: Group): Promise<void> {
    await this._ds.put(GROUPS_TABLE, groupToDbGroup(group));
  }

  async _findDbGroup(groupId: Uint8Array): Promise<?DbGroup> {
    try {
      return await this._ds.get(GROUPS_TABLE, utils.toBase64(groupId));
    } catch (e) {
      if (!(e instanceof dbErrors.RecordNotFound)) {
        throw e;
      }
    }
    return null;
  }

  findFull = async (args: { groupId?: Uint8Array, groupPublicEncryptionKey?: Uint8Array }): Promise<?Group> => {
    const { groupId, groupPublicEncryptionKey } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findFull: expected exactly one argument, got ${Object.keys(args).length}`);

    let record;
    if (groupId) {
      record = await this._findDbGroup(groupId);
    } else if (groupPublicEncryptionKey) {
      record = await this._ds.first(GROUPS_TABLE, { selector: { publicEncryptionKey: utils.toBase64(groupPublicEncryptionKey) } });
    } else
      throw new Error('Assertion failed: findFull: both selectors are null');

    if (!record || !record.privateSignatureKey || !record.privateEncryptionKey)
      return null;
    return dbGroupToGroup(record);
  }

  findExternal = async (args: { groupId?: Uint8Array, groupPublicEncryptionKey?: Uint8Array }): Promise<?ExternalGroup> => {
    const { groupId, groupPublicEncryptionKey } = args;
    if (Object.keys(args).length !== 1)
      throw new Error(`findExternal: expected exactly one argument, got ${Object.keys(args).length}`);

    if (groupId) {
      const record = await this._findDbGroup(groupId);
      if (!record)
        return null;
      return dbGroupToExternalGroup(record);
    } else if (groupPublicEncryptionKey) {
      const record = await this._ds.first(GROUPS_TABLE, { selector: { publicEncryptionKey: utils.toBase64(groupPublicEncryptionKey) } });
      if (record)
        return dbGroupToExternalGroup(record);
    } else
      throw new Error('findExternal: invalid argument');
    return null;
  }
}
