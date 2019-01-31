// @flow
import Tanker from '@tanker/client-browser';
import { type b64string } from '@tanker/core';

import { tankerUrl, makePrefix } from '../Helpers';
import { generateFunctionalTests } from '../functional';

const makeTanker = (trustchainId: b64string): Tanker => (
  new Tanker({
    trustchainId,
    // $FlowIKnow adapter key is passed as a default option by @tanker/client-browser
    dataStore: { prefix: makePrefix() },
    sdkType: 'test',
    url: tankerUrl,
  })
);

generateFunctionalTests('client-browser', makeTanker);
