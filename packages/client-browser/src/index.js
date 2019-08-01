// @flow
import type { TankerOptions } from '@tanker/core';
import { Tanker as TankerCore, optionsWithDefaults } from '@tanker/core';
import Dexie from '@tanker/datastore-dexie-browser';
import * as streams from '@tanker/stream-browser';

const defaultOptions = {
  dataStore: { adapter: Dexie },
  sdkType: 'client-browser',
  streams,
};

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }
}

export type { b64string, EmailVerification, PassphraseVerification, KeyVerification, Verification, TankerOptions } from '@tanker/core';
export { errors, fromBase64, toBase64 } from '@tanker/core';
export { Tanker };
export default Tanker;
