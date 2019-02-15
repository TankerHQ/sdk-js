// @flow
import type { TankerInterface } from '@tanker/core';
import { TrustchainHelper } from './Helpers';

export type TestResource<T> = { type: Class<T>, resource: T };
export type TestResources = { [string]: Array<TestResource<any>> };

export type TestArgs = {
  trustchainHelper: TrustchainHelper,
  aliceLaptop: TankerInterface,
  bobLaptop: TankerInterface,
  bobPhone: TankerInterface,
  resources: TestResources,
};
