// @flow
import { getTankerVersion, Tanker } from '@tanker/client-node';
import { generateUserToken } from '@tanker/user-token';
import adapter from '@tanker/datastore-pouchdb-memory';

import { generateV1Tests } from 'tests';

generateV1Tests({
  version: getTankerVersion(),
  Tanker,
  generateUserToken,
  tests: ['encrypt', 'group', 'unlock', 'revocationV1'],
  adapter,
});
