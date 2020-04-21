// @flow
import type { Tanker } from '@tanker/core';

import type { AppHelper } from './AppHelper';

export type TestResource<T> = { size: number, type: Class<T>, resource: T };
export type TestResources = { [string]: Array<TestResource<any>> };

export type TestArgs = {
  appHelper: AppHelper,
  resources: TestResources,
  makeTanker: (b64AppId?: string) => Tanker,
};
