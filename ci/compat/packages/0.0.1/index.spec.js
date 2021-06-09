// @flow

import { generateCompatTests } from 'tests';

import { createIdentity } from '@tanker/identity';
import adapter from '../../../../packages/datastore/pouchdb-memory';
import { Tanker } from '../../../../packages/client-node';

generateCompatTests({
  createIdentity,
  Tanker,
  tests: ['deviceUpgrade', 'encryption', 'encryptionSession', 'group', 'revocation', 'filekit'],
  adapter,
});
