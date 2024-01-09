import { getGlobalThis } from './global-this';
import type { Hub } from '@sentry/types';

const myGlobalThis: typeof globalThis & {
  Sentry?: {
    getCurrentHub?: () => Hub,
  };
} = getGlobalThis();

export { myGlobalThis as globalThis };
