import { generateFunctionalTests } from '@tanker/functional-tests';
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';

import Tanker from '@tanker/client-node';

generateFunctionalTests('client-node', Tanker.defaults({ dataStore: { adapter: PouchDBMemory } }));
