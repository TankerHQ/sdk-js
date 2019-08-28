// @flow
import type { Tanker } from '@tanker/core';
import { AppHelper } from './Helpers';

export type TestResource<T> = { type: Class<T>, resource: T };
export type TestResources = { [string]: Array<TestResource<any>> };

export type TestArgs = {
  appHelper: AppHelper,
  resources: TestResources,
  makeTanker: (b64AppId?: string) => Tanker,
};
