// @flow
import type { TankerInterface } from '@tanker/core';
import { TrustchainHelper } from './Helpers';

export type TestResources = { [size: string]: { [type: string]: * } };

export type TestArgs = {
  trustchainHelper: TrustchainHelper,
  aliceLaptop: TankerInterface,
  bobLaptop: TankerInterface,
  bobPhone: TankerInterface,
  resources: TestResources,
};
