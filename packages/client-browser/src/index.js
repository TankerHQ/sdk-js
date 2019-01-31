// @flow
import { Tanker as TankerCore, optionsWithDefaults, type TankerOptions } from '@tanker/core';
import Dexie from '@tanker/datastore-dexie-browser';

const defaultOptions = {
  dataStore: { adapter: Dexie },
  sdkType: 'client-browser'
};

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }
}

export type { b64string } from '@tanker/core';
export { errors, getTankerVersion, TankerStatus, createUserSecret, fromBase64, fromString, getResourceId, toBase64, toString } from '@tanker/core';
export { Tanker };
export default Tanker;
