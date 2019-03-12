// @flow
import { getTankerVersion, Tanker } from '@tanker/client-node';
import { generateUserToken } from '@tanker/user-token';

const generateTests = require('tests');

generateTests(getTankerVersion(), Tanker, generateUserToken);
