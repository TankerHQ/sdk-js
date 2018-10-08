// @flow
/* eslint no-underscore-dangle: 0 */
import { utils } from '@tanker/crypto';

function decodeDoc(doc: any) {
  if (!doc) return doc;
  const index = doc._doc_id_rev.lastIndexOf(':');
  const decodedDoc = { ...doc, _id: doc._doc_id_rev.substring(0, index - 1) };
  delete decodedDoc._doc_id_rev;
  return decodedDoc;
}

function decodeMetadata(meta: any) {
  const metadata = JSON.parse(meta.data);
  metadata.winningRev = meta.winningRev;
  metadata.deleted = meta.deletedOrLocal === '1';
  metadata.seq = meta.seq;
  return metadata;
}

// Code inspired by:
//   - http://dexie.org/docs/Dexie/Dexie#sample-open-existing-database-as-is
//   - https://github.com/pouchdb/pouchdb/tree/master/packages/node_modules/pouchdb-adapter-idb/src
//
// Note: will raise a DexieError{name: "NoSuchDatabaseError"} if no PouchDB available
export const extractRecords = (Dexie: any, dbName: string): Promise<Array<Object>> => {
  const pouchDbName = `_pouch_${dbName}`;

  // WARNING: transaction scopes are easy to break in Dexie, so be careful
  //          if you feel like refactoring the code below...
  //
  //          See: http://dexie.org/docs/Dexie/Dexie.transaction()#transaction-scope
  //               http://dexie.org/docs/Dexie/Dexie.transaction()#async-and-await
  //
  return new Dexie(pouchDbName).open().then(db => {
    // WARNING: used to migrate from 1.6.2 to 1.6.3 only, don't replace
    //          with numeric natures!
    const b64keys = {
      device_creation: [
        'user_id',
        'last_reset',
        'ephemeral_public_signature_key',
        'delegation_signature',
        'public_signature_key',
        'public_encryption_key'
      ],
      device_revocation: ['device_id'],
      key_publish: ['mac', 'recipient', 'key'],
      trustchain_creation: ['public_signature_key']
    };

    const handler = async () => {
      // get metadata of all docs
      const metadatas = await db.table('document-store').toArray();

      const promises = metadatas.map(async metadata => {
        if (!metadata) return null;

        const { id, deleted, winningRev } = decodeMetadata(metadata);
        const docIdRev = `${id}::${winningRev}`;

        // skip deleted records
        if (deleted) return null;

        const result = await db.table('by-sequence').where('_doc_id_rev').equals(docIdRev).first();
        const doc = decodeDoc(result) || {};

        // skip _design records stored alongside the data!
        if (doc._id.substr(0, 7) === '_design') return null;

        // transform old serialized payload values from Base64 to Uint8Array
        ['payload_verified', 'payload_unverified'].forEach(payloadType => {
          if (payloadType in doc) {
            const payload = doc[payloadType];
            b64keys[doc.nature].forEach(key => {
              if (key in payload) {
                payload[key] = utils.fromBase64(payload[key]);
              }
            });
          }
        });

        return doc;
      });

      const docs = await Dexie.Promise.all(promises);

      // synchronously closes the indexedDB
      db.close();

      return docs.filter(d => !!d); // skip null values (deleted or design docs)
    };

    // wrap all in a single indexedDB transaction
    return db.transaction('r', 'document-store', 'by-sequence', handler);
  });
};

// Return the internal names of indexedDB databases used by PouchDB:
//   - one named `_pouch_${dbName}` for the data itself
//   - an additional named `_pouch_${dbName}-mrview-${someHexHash}` per index
//
// Note: will raise a DexieError{name: "NoSuchDatabaseError"} if no PouchDB available
export const extractDbNames = (Dexie: any, dbName: string): Promise<Array<Object>> => {
  const pouchDbName = `_pouch_${dbName}`;

  return new Dexie(pouchDbName).open().then(async (db) => {
    const dbNames = [pouchDbName];

    // find the "index" databases related to this main database
    const record = await db.table('local-store').get('_local/_pouch_dependentDbs');

    if (record) { // undefined if not found
      const { dependentDbs } = record;
      Object.keys(dependentDbs).forEach(key => {
        if (dependentDbs[key]) {
          dbNames.push(`_pouch_${key}`);
        }
      });
    }

    // synchronously closes the indexedDB
    db.close();

    return dbNames;
  });
};
