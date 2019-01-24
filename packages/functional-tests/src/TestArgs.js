// @flow
import type { TankerInterface } from '@tanker/core';
import { TrustchainHelper } from './Helpers';

export type TestArgs = {
  trustchainHelper: TrustchainHelper,
  aliceLaptop: TankerInterface,
  bobLaptop: TankerInterface,
  bobPhone: TankerInterface,
  resources: { [resourceType: string]: { clear: string | Uint8Array, encryptionMethod: string, decryptionMethod: string } }
};
