// @flow
import { Tanker } from '@tanker/core';
import { TrustchainHelper } from './Helpers';

export type TestArgs = {
  trustchainHelper: TrustchainHelper,
  aliceLaptop: Tanker,
  bobLaptop: Tanker,
  bobPhone: Tanker,
};
