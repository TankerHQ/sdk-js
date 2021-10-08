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

export { errors, fromBase64, toBase64, prehashPassword } from '@tanker/core';
export { Tanker };
export default Tanker;
