// @flow
import { Tanker } from '@tanker/client-node';
import { createIdentity } from '@tanker/identity';
import adapter from '@tanker/datastore-pouchdb-memory';

import { generateV2Tests } from 'tests';

generateV2Tests({
  createIdentity,
  Tanker,
  tests: ['encrypt', 'group', 'verification', 'revocationV2', 'filekit', 'encryptionSession'],
  adapter,
});
