// @flow
import type { TankerOptions } from '@tanker/core';
import { Tanker as TankerCore, optionsWithDefaults } from '@tanker/core';
import PouchDB from '@tanker/datastore-pouchdb-node';

const defaultOptions = {
  dataStore: { adapter: PouchDB },
  sdkType: 'client-node',
};

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }
}

export type { b64string, EmailVerification, PassphraseVerification, KeyVerification, Verification, TankerOptions } from '@tanker/core';
export { errors, fromBase64, toBase64, hashPassphrase } from '@tanker/core';
export { Tanker };
export default Tanker;
