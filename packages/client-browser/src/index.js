// @flow
import { Tanker as TankerCore } from '@tanker/core';
import Dexie from '@tanker/datastore-dexie-browser';

// Issue with Babel < 7: https://github.com/babel/babel/pull/6238
//
// When switching to Babel 7+, just replace the two exports below with:
//
//    export * from '@tanker/core'
//
export { errors, getTankerVersion, TankerStatus, createUserSecret, fromBase64, fromString, getResourceId, toBase64, toString } from '@tanker/core';
export type { b64string } from '@tanker/core';

export const Tanker = TankerCore.defaults({
  dataStore: { adapter: Dexie },
  sdkType: 'client-browser'
});

export default Tanker;

export {
  File,
  MergerStreamWeb as MergerStream,
  ResizerStream,
  SlicerStream,
} from '@tanker/streams';
