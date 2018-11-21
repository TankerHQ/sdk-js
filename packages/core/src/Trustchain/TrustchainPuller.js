// @flow
import { utils } from '@tanker/crypto';
import uniq from 'lodash.uniqby';

import { Client } from '../Network/Client';
import { PromiseWrapper } from '../PromiseWrapper';
import TrustchainStore, { type UnverifiedTrustchainCreation } from '../Trustchain/TrustchainStore';
import UnverifiedStore from '../UnverifiedStore/UnverifiedStore';
import { type UnverifiedEntry, blockToEntry } from '../Blocks/entries';
import TrustchainVerifier from './TrustchainVerifier';
import SynchronizedEventEmitter from '../SynchronizedEventEmitter';


import {
  isKeyPublish,
  isUserGroup,
  natureKind,
  unserializeBlock,
  NATURE_KIND,
} from '../Blocks/payloads';


export default class TrustchainPuller {
  _catchUpInProgress: ?Promise<void> = null;
  _caughtUpOnce: PromiseWrapper<void>;
  _trustchainStore: TrustchainStore;
  _trustchainVerifier: TrustchainVerifier;
  _unverifiedStore: UnverifiedStore;
  client: Client;
  synchronizedClient: SynchronizedEventEmitter;
  events: Array<number>;
  _extraUsers: Array<Uint8Array>;
  _extraGroups: Array<Uint8Array>;
  _donePromises: Array<PromiseWrapper<void>>;
  _userId: Uint8Array;
  _closing: bool = false;

  constructor(client: Client, userId: Uint8Array, trustchainStore: TrustchainStore, unverifiedStore: UnverifiedStore, trustchainVerifier: TrustchainVerifier) {
    this._caughtUpOnce = new PromiseWrapper();

    this.client = client;
    this._userId = userId;
    this._trustchainStore = trustchainStore;
    this._trustchainVerifier = trustchainVerifier;
    this._unverifiedStore = unverifiedStore;
    this.synchronizedClient = new SynchronizedEventEmitter(client);
    this.events = [
      this.synchronizedClient.on('blockAvailable', () => this.scheduleCatchUp()),
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

    this._donePromises.forEach(d => d.resolve());
  }

  // It's safe to await this promise which never rejects
  succeededOnce = async (): Promise<void> => this._caughtUpOnce.promise;

  scheduleCatchUp = (extraUsers?: Array<Uint8Array>, extraGroups?: Array<Uint8Array>): Promise<void> => {
    if (this._closing) {
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
          this.scheduleCatchUp();
        }
      });
    }

    return done.promise;
  }

  _catchUp = async (extraUsers: Array<Uint8Array>, extraGroups: Array<Uint8Array>): Promise<void> => {
    try {
      const blocks = await this.client._send('get blocks 2', { // eslint-disable-line no-underscore-dangle
        index: this._trustchainStore.lastBlockIndex,
        trustchain_id: utils.toBase64(this.client.trustchainId),
        extra_users: extraUsers,
        extra_groups: extraGroups
      });

      const entries = blocks.map(b => blockToEntry(unserializeBlock(utils.fromBase64(b))));
      await this._processNewEntries(entries);
    } catch (e) {
      console.error('CatchUp failed: ', e);
    }
    if (!this._caughtUpOnce.settled) {
      this._caughtUpOnce.resolve();
    }
  }

  _processNewEntries = async (entries: Array<UnverifiedEntry>) => {
    const keyPublishes = [];
    const userEntries = [];
    const userGroups = [];
    let trustchainCreationEntry = null;
    let maxBlockIndex = 0;

    // Separate our entries for each store
    for (const unverifiedEntry of entries) {
      if (unverifiedEntry.index > maxBlockIndex) {
        maxBlockIndex = unverifiedEntry.index;
      }

      if (isKeyPublish(unverifiedEntry.nature)) {
        keyPublishes.push(unverifiedEntry);
      } else if (isUserGroup(unverifiedEntry.nature)) {
        userGroups.push(unverifiedEntry);
      } else if (natureKind(unverifiedEntry.nature) === NATURE_KIND.device_creation) {
        userEntries.push(unverifiedEntry);
      } else if (natureKind(unverifiedEntry.nature) === NATURE_KIND.device_revocation) {
        userEntries.push(unverifiedEntry);
      } else if (natureKind(unverifiedEntry.nature) === NATURE_KIND.trustchain_creation) {
        trustchainCreationEntry = unverifiedEntry;
      } else {
        throw new Error('Assertion error: Unexpected nature in trustchain puller callback');
      }
    }

    if (trustchainCreationEntry) {
      const trustchainCreation: UnverifiedTrustchainCreation = { ...trustchainCreationEntry, ...trustchainCreationEntry.payload_unverified };
      // force trustchain creation verification (to avoid corner cases)
      await this._trustchainVerifier.verifyTrustchainCreation(trustchainCreation);
    }

    const newUserEntries = await this._unverifiedStore.addUnverifiedUserEntries(userEntries);
    await this._unverifiedStore.addUnverifiedKeyPublishes(keyPublishes);
    await this._unverifiedStore.addUnverifiedUserGroups(userGroups);
    await this._trustchainStore.updateLastBlockIndex(maxBlockIndex);

    let mustUpdateOurselves = false;
    for (const newUserEntry of newUserEntries) {
      if (!newUserEntry.user_id) {
        throw new Error('Assertion error: entry should have a user_id');
      }
      if (utils.equalArray(this._userId, newUserEntry.user_id)) {
        mustUpdateOurselves = true;
      }
    }
    if (mustUpdateOurselves) {
      await this._trustchainVerifier.updateUserStore([this._userId]);
    }
  };
}
