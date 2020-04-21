// @flow
import { uuid } from '@tanker/test-utils';

export const makePrefix = (length: number = 12) => uuid.v4().replace('-', '').slice(0, length);
