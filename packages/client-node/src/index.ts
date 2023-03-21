import type { TankerOptions } from '@tanker/core';
import { Tanker as TankerCore, optionsWithDefaults } from '@tanker/core';
import { pouchDBNode } from '@tanker/datastore-pouchdb-node';

const defaultOptions = {
  dataStore: { adapter: pouchDBNode },
  sdkType: 'client-node',
};

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }
}

export { errors, fromBase64, toBase64, prehashPassword, Padding } from '@tanker/core';
export { Tanker };
export default Tanker; // eslint-disable-line no-restricted-exports
