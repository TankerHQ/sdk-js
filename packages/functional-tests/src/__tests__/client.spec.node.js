// @flow
import { generateFunctionalTests } from '@tanker/functional-tests';
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';

import Tanker from '@tanker/client-node';

// $FlowFixMe Tanker needs a real flow interface
generateFunctionalTests('client-node', Tanker.defaults({ dataStore: { adapter: PouchDBMemory }, sdkType: 'test' }));
