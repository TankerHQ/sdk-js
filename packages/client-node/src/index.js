// @flow
import { Tanker as TankerCore, optionsWithDefaults, type TankerOptions } from '@tanker/core';
import PouchDB from '@tanker/datastore-pouchdb-node';

const defaultOptions = {
  dataStore: { adapter: PouchDB },
  sdkType: 'client-node'
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
