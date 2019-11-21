// @flow
import { utils, type b64string } from '@tanker/crypto';
import { InternalError } from '@tanker/errors';

import { Client } from '../Network/Client';
import { PromiseWrapper } from '../PromiseWrapper';
import TrustchainStore from './TrustchainStore';
import UnverifiedStore from './UnverifiedStore/UnverifiedStore';

import {
  trustchainCreationFromBlock
} from '../Session/LocalUser/Serialize';

import {
  deviceCreationFromBlock,
  deviceRevocationFromBlock,
} from '../Users/Serialize';

import {
  isKeyPublish,
  isUserGroup,
  isDeviceCreation,
  isDeviceRevocation,
  isTrustchainCreation,
} from '../Blocks/Nature';

import { unserializeBlock } from '../Blocks/payloads';
import { type Block } from '../Blocks/Block';

import TrustchainVerifier from './TrustchainVerifier';
import SynchronizedEventEmitter from '../SynchronizedEventEmitter';

const uniq = (array: Array<string>): Array<string> => [...new Set(array)];

export default class TrustchainPuller {
  _catchUpInProgress: ?Promise<void> = null;
  _caughtUpOnce: PromiseWrapper<void>;
  _trustchainStore: TrustchainStore;
  _trustchainVerifier: TrustchainVerifier;
  _unverifiedStore: UnverifiedStore;
  client: Client;
  synchronizedClient: SynchronizedEventEmitter<Client>;
  events: Array<number>;
  _extraUsers: Array<Uint8Array>;
  _extraGroups: Array<Uint8Array>;
  _donePromises: Array<PromiseWrapper<void>>;
  _userId: Uint8Array;
  _closing: bool = false;

  _deviceIdToUserId: Map<b64string, b64string> = new Map();


  constructor(client: Client, userId: Uint8Array, trustchainStore: TrustchainStore, unverifiedStore: UnverifiedStore, trustchainVerifier: TrustchainVerifier) {
    this._caughtUpOnce = new PromiseWrapper();

    this.client = client;
    this._userId = userId;
    this._trustchainStore = trustchainStore;
    this._trustchainVerifier = trustchainVerifier;
    this._unverifiedStore = unverifiedStore;
    this.synchronizedClient = new SynchronizedEventEmitter(client);
    this.events = [
      this.synchronizedClient.on('blockAvailable', () => this.scheduleCatchUp().catch(e => console.error('Caught error in background catch up', e))),
    ];

    this._extraUsers = [];
    this._extraGroups = [];
    this._donePromises = [];
  }

  async close() {
    this._closing = true;
    const { events } = this;
    this.events = [];
    for (const id of events)
      await this.synchronizedClient.removeListener(id);

    if (this._catchUpInProgress) {
      await this._catchUpInProgress;
    }
  }

  // It's safe to await this promise which never rejects
  succeededOnce = async (): Promise<void> => this._caughtUpOnce.promise;

  scheduleCatchUp = (extraUsers?: Array<Uint8Array>, extraGroups?: Array<Uint8Array>): Promise<void> => {
    if (this._closing) {
      this._donePromises.forEach(d => d.resolve());
      this._donePromises = [];
      return Promise.resolve(undefined);
    }

    // enqueue requirements
    if (extraUsers)
      this._extraUsers = this._extraUsers.concat(extraUsers);
    if (extraGroups)
      this._extraGroups = this._extraGroups.concat(extraGroups);

    // handle to warn me when my requirements are met
    const done = new PromiseWrapper();
    this._donePromises.push(done);

    // no catch up, schedule one
    if (!this._catchUpInProgress) {
      const currentExtraUsers = uniq(this._extraUsers.map(utils.toBase64));
      const currentExtraGroups = uniq(this._extraGroups.map(utils.toBase64));
      const donePromises = this._donePromises;

      this._extraUsers = [];
      this._extraGroups = [];
      this._donePromises = [];

      this._catchUpInProgress = this._catchUp(currentExtraUsers, currentExtraGroups).then(() => {
        this._catchUpInProgress = null;

        donePromises.forEach(d => d.resolve());

        if (this._donePromises.length > 0) {
          this.scheduleCatchUp().catch(e => console.error('Caught error in background catch up', e));
        }
      }).catch((e) => {
        this._catchUpInProgress = null;
        donePromises.forEach(d => d.reject(e));
      });
    }

    return done.promise;
  }

  _catchUp = async (extraUsers: Array<b64string>, extraGroups: Array<b64string>): Promise<void> => {
    const blocks = await this.client.send('get blocks 2', {
      index: this._trustchainStore.lastBlockIndex,
      trustchain_id: utils.toBase64(this.client.trustchainId),
      extra_users: extraUsers,
      extra_groups: extraGroups,
      on_demand_key_publishes: true,
      on_demand_user_groups: true,
      on_demand_claims: true,
    });
    await this._processNewBlocks(blocks);

    if (!this._caughtUpOnce.settled) {
      this._caughtUpOnce.resolve();
    }
  }

  _processNewBlocks = async (b64Blocks: Array<string>) => {
    const userEntries = [];
    let trustchainCreationEntry = null;
    let maxBlockIndex = 0;

    const userIds = [];
    // Separate our entries for each store
    for (const b64Block of b64Blocks) {
      const block = unserializeBlock(utils.fromBase64(b64Block));
      if (block.index > maxBlockIndex) {
        maxBlockIndex = block.index;
      }

      if (isDeviceCreation(block.nature)) {
        const userEntry = deviceCreationFromBlock(block);
        userEntries.push(userEntry);
        this._deviceIdToUserId.set(utils.toBase64(userEntry.hash), utils.toBase64(userEntry.user_id));
        userIds.push(userEntry.user_id);
      } else if (isDeviceRevocation(block.nature)) {
        const userEntry = await this._deviceRevocationFromBlock(block);
        userEntries.push(userEntry);
        userIds.push(userEntry.user_id);
      } else if (isTrustchainCreation(block.nature)) {
        trustchainCreationEntry = trustchainCreationFromBlock(b64Block);
      } else if (!isKeyPublish(block.nature) && !isUserGroup(block.nature)) {
        throw new InternalError('Assertion error: Unexpected nature in trustchain puller callback');
      }
    }

    if (trustchainCreationEntry) {
      await this._trustchainVerifier.verifyTrustchainCreation(trustchainCreationEntry);
    }

    await this._unverifiedStore.addUnverifiedUserEntries(userEntries);
    await this._trustchainStore.updateLastBlockIndex(maxBlockIndex);

    if (userIds.length) {
      await this._trustchainVerifier.updateUserStore(userIds);
    }
  };

  _deviceRevocationFromBlock = async (block: Block) => {
    const userIdString = this._deviceIdToUserId.get(utils.toBase64(block.author));
    let userId: ?Uint8Array;
    if (!userIdString)
      userId = await this._unverifiedStore.getUserIdFromDeviceId(block.author);
    else
      userId = utils.fromBase64(userIdString);
    if (!userId) {
      throw new InternalError('Assertion error: Unknown user for device revocation');
    }
    return deviceRevocationFromBlock(block, userId);
  }
}
