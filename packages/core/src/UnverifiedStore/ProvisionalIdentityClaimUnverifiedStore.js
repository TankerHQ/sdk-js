//@flow

import { utils } from '@tanker/crypto';
import { type DataStore } from '@tanker/datastore-base';

import { entryToDbEntry, dbEntryToEntry, type VerificationFields } from '../Blocks/entries';
import { type ProvisionalIdentityClaimRecord } from '../Blocks/payloads';

const UNVERIFIED_CLAIMS_TABLE = 'unverified_invite_claims'; // Table that stores our unverified claim blocks

export type UnverifiedProvisionalIdentityClaim = {
  ...VerificationFields,
  ...ProvisionalIdentityClaimRecord,
};
export type VerifiedProvisionalIdentityClaim = UnverifiedProvisionalIdentityClaim

export default class ProvisionalIdentityClaimUnverifiedStore {
  _ds: DataStore<*>;

  static tables = [{
    name: UNVERIFIED_CLAIMS_TABLE,
    indexes: [['index'], ['user_id']]
  }];

  constructor(ds: DataStore<*>) {
    // won't be enumerable, nor reconfigurable
    Object.defineProperty(this, '_ds', { value: ds, writable: true });
  }

  static async open(ds: DataStore<*>): Promise<ProvisionalIdentityClaimUnverifiedStore> {
    return new ProvisionalIdentityClaimUnverifiedStore(ds);
  }

  async close(): Promise<void> {
    // $FlowIKnow
    this._ds = null;
  }

  async addUnverifiedProvisionalIdentityClaimEntries(entries: Array<UnverifiedProvisionalIdentityClaim>): Promise<void> {
    if (entries.length === 0)
      return;
    const mapEntry = new Map();
    for (const entry of entries) {
      const dbEntry = entryToDbEntry(entry, utils.toBase64(entry.author_signature_by_app_key));
      mapEntry.set(dbEntry._id, dbEntry); // eslint-disable-line no-underscore-dangle
    }
    await this._ds.bulkAdd(UNVERIFIED_CLAIMS_TABLE, [...mapEntry.values()]);
  }

  async findUnverifiedProvisionalIdentityClaims(userId: Uint8Array): Promise<Array<UnverifiedProvisionalIdentityClaim>> {
    const userIdBase64 = utils.toBase64(userId);
    const entries = await this._ds.find(UNVERIFIED_CLAIMS_TABLE, {
      selector: {
        user_id: userIdBase64,
      },
      sort: [{ index: 'asc' }],
    });

    return entries.map(dbEntryToEntry);
  }

  async removeVerifiedProvisionalIdentityClaimEntries(entries: Array<VerifiedProvisionalIdentityClaim>): Promise<void> {
    for (const entry of entries) {
      await this._ds.delete(UNVERIFIED_CLAIMS_TABLE, utils.toBase64(entry.author_signature_by_app_key));
    }
  }
}
