// @flow
import Tanker from '@tanker/client-node';
import { type b64string } from '@tanker/core';
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';

import { tankerUrl, makePrefix } from '../Helpers';
import { generateFunctionalTests } from '../functional';

const makeTanker = (trustchainId: b64string): Tanker => (
  new Tanker({
    trustchainId,
    dataStore: { adapter: PouchDBMemory, prefix: makePrefix() },
    sdkType: 'test',
    url: tankerUrl,
  })
);

generateFunctionalTests('client-node', makeTanker);
