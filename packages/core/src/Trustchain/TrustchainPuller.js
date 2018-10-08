// @flow
import { Mutex } from 'async-mutex';
import { utils } from '@tanker/crypto';
import uniqBy from 'lodash.uniqby';

import { Client } from '../Network/Client';
import { PromiseWrapper } from '../PromiseWrapper';
import TrustchainStore, { blockToEntry } from '../Trustchain/TrustchainStore';
import UnverifiedStore from '../UnverifiedStore/UnverifiedStore';
import { type UnverifiedEntry } from '../Blocks/entries';

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
  _catchUpScheduled: ?Promise<void> = null;
  _caughtUpOnce: PromiseWrapper<void>;
  newBlockLock: Mutex = new Mutex();
  _trustchainStore: TrustchainStore;
  _trustchainVerifier: TrustchainVerifier;
  _unverifiedStore: UnverifiedStore;
  client: Client;
  synchronizedClient: SynchronizedEventEmitter;
  events: Array<number>;
  _extraUsers: Array<Uint8Array>;
  _extraGroups: Array<Uint8Array>;
  _userId: Uint8Array;

  constructor(client: Client, userId: Uint8Array, trustchainStore: TrustchainStore, unverifiedStore: UnverifiedStore, trustchainVerifier: TrustchainVerifier) {
    this._caughtUpOnce = new PromiseWrapper();

    this.client = client;
    this._userId = userId;
    this._trustchainStore = trustchainStore;
    this._trustchainVerifier = trustchainVerifier;
    this._unverifiedStore = unverifiedStore;
    this.synchronizedClient = new SynchronizedEventEmitter(client);
    this.events = [
      this.synchronizedClient.on('blockAvailable', () => this.scheduleCatchUp([])),
    ];

    this._extraUsers = [];
    this._extraGroups = [];
  }

  async close() {
    const { events } = this;
    this.events = [];
    for (const id of events)
      await this.synchronizedClient.removeListener(id);

    this._caughtUpOnce = new PromiseWrapper();
    // $FlowIKnow
    this._trustchainStore = null;
  }

  // It's safe to await this promise which never rejects
  succeededOnce = async (): Promise<void> => this._caughtUpOnce.promise;

  // Enqueue a new catchUp
  //
  // catchUp are mutexed so that we avoid doing two catchUps at the same time.
  // Without the lock, we can start a catchUp with index 10, then we receive a
  // new block event and we start another catchUp with index 10. With the lock,
  // the second catchUp will wait for the first to finish, so it will start with
  // index 11.
  //
  // About what happens here: if this method is called, a catch up is scheduled,
  // unless a catchup is already in the queue (this._catchUpScheduled != nil).
  // We keep an _extraUsers array (and _extraGroups) where we store all the
  // users that need to be explicitely pulled. When the catch up starts, we
  // reset this list and we do our catch up.
  //
  // WARNING: we must be extra careful about suspension points here, we rely on
  // the single-thread-ity of JS to be race-free. There must be no await in
  // scheduleCatchUp, and no await before we finish dealing with the _extraUsers
  // and _catchUpScheduled in the mutexed lambda. I have put that in non-async
  // contexts to make sure you don't await there.
  scheduleCatchUp = (extraUsers?: Array<Uint8Array>, extraGroups?: Array<Uint8Array>): Promise<void> => {
    if (extraUsers)
      this._extraUsers = this._extraUsers.concat(extraUsers);
    if (extraGroups)
      this._extraGroups = this._extraGroups.concat(extraGroups);

    if (!this._catchUpScheduled) {
      this._catchUpScheduled = this.newBlockLock.runExclusive(() => {
        const currentExtraUsers = uniqBy(this._extraUsers, x => utils.toBase64(x));
        const currentExtraGroups = uniqBy(this._extraGroups, x => utils.toBase64(x));

        this._extraUsers = [];
        this._extraGroups = [];

        this._catchUpScheduled = null;
        return this._catchUp(currentExtraUsers, currentExtraGroups);
      });
    }

    return this._catchUpScheduled;
  }

  _catchUp = async (extraUsers?: Array<Uint8Array>, extraGroups?: Array<Uint8Array>): Promise<void> => {
    try {
      const blocks = await this.client._send('get blocks 2', { // eslint-disable-line no-underscore-dangle
        index: this._trustchainStore.lastBlockIndex,
        trustchain_id: utils.toBase64(this.client.trustchainId),
        extra_users: extraUsers ? extraUsers.map(utils.toBase64) : [],
        extra_groups: extraGroups ? extraGroups.map(utils.toBase64) : []
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
      await this._trustchainStore.addTrustchainCreation(trustchainCreationEntry);
      // force trustchain creation verification (to avoid corner cases)
      await this._trustchainVerifier.verifyTrustchainCreation(trustchainCreationEntry);
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
