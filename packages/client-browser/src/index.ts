import type { TankerOptions } from '@tanker/core';
import { Tanker as TankerCore, optionsWithDefaults } from '@tanker/core';
import { dexieBrowser } from '@tanker/datastore-dexie-browser';

const defaultOptions = {
  dataStore: { adapter: dexieBrowser },
  sdkType: 'client-browser',
};

class Tanker extends TankerCore {
  constructor(options: TankerOptions) {
    super(optionsWithDefaults(options, defaultOptions));
  }
}

export { errors, fromBase64, toBase64, prehashPassword, Padding } from '@tanker/core';
export { Tanker };
export default Tanker; // eslint-disable-line no-restricted-exports
