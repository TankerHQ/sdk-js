// @flow
import { Tanker } from '@tanker/core';
import { TrustchainHelper } from './Helpers';

export type TestArgs = {
  trustchainHelper: TrustchainHelper,
  aliceLaptop: Tanker,
  bobLaptop: Tanker,
  bobPhone: Tanker,
  resources: { [resourceType: string]: { clear: string | Uint8Array, encryptionMethod: string, decryptionMethod: string } }
};
