// @flow
import Tanker from '@tanker/client-node';
import { type TankerInterface, type b64string } from '@tanker/core';
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';

import { tankerUrl, makePrefix, makeRandomUint8Array } from '../Helpers';
import { generateFunctionalTests } from '../functional';
import { type TestResources } from '../TestArgs';

const makeTanker = (trustchainId: b64string): TankerInterface => {
  const tanker: TankerInterface = (new Tanker({
    trustchainId,
    dataStore: { adapter: PouchDBMemory, prefix: makePrefix() },
    sdkType: 'test',
    url: tankerUrl,
  }): any);

  return tanker;
};

const generateTestResources = (): TestResources => {
  const small = makeRandomUint8Array(1024); // 1kB
  const big = makeRandomUint8Array(6 * 1024 * 1024); // 6MB

  const result = {
    small: {
      ArrayBuffer: small.buffer,
      Buffer: Buffer.from(small.buffer),
      Uint8Array: small,
    },
    big: {
      ArrayBuffer: big.buffer,
      Buffer: Buffer.from(big.buffer),
      Uint8Array: big,
    }
  };

  return result;
};

generateFunctionalTests('client-node', makeTanker, generateTestResources);
