import { generateFunctionalTests } from '@tanker/functional-tests';

import Tanker from '@tanker/client-browser';

generateFunctionalTests('client-browser', Tanker.defaults({ sdkType: 'tests' }));
