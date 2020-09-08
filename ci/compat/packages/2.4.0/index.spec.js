// @flow
import { Tanker } from '@tanker/client-node';
import { createIdentity } from '@tanker/identity';
import adapter from '@tanker/datastore-pouchdb-memory';

import { generateCompatTests } from 'tests';

generateCompatTests({
  createIdentity,
  Tanker,
  tests: ['deviceUpgrade', 'encryption', 'encryptionSession', 'group', 'revocation', 'filekit'],
  adapter,
});
