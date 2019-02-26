// @flow
import { getTankerVersion, Tanker } from '@tanker/client-node';

const generateTests = require('tests');

generateTests(getTankerVersion(), Tanker);
