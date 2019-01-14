// @flow
import { generateFunctionalTests } from '@tanker/functional-tests';

import Tanker from '@tanker/client-browser';

// $FlowFixMe Tanker needs a real flow interface
generateFunctionalTests('client-browser', Tanker.defaults({ sdkType: 'test' }));
