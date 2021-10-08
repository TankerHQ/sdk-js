import type { Tanker } from '@tanker/core';
import type { Class, Data } from '@tanker/types';

import type { AppHelper } from './AppHelper';

export type TestResource<T> = { size: number; type: Class<T>; resource: T; };
export type TestResourceSize = 'empty' | 'small' | 'medium' | 'big';
export type TestResources<T extends Data = Data> = Record<TestResourceSize, Array<TestResource<T>>>;

export type TestArgs = {
  appHelper: AppHelper;
  resources: TestResources;
  makeTanker: (b64AppId?: string) => Tanker;
};
