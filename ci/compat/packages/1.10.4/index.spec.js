// @flow
import { getTankerVersion, Tanker } from '@tanker/client-node';
import { generateUserToken } from '@tanker/user-token';

import generateTests from 'tests';

generateTests({
  version: getTankerVersion(),
  Tanker,
  generateUserToken,
  tests: ['encrypt', 'group', 'unlock', 'revocation']
});
