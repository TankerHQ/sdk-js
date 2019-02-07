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
    small: [
      { type: ArrayBuffer, resource: small.buffer },
      { type: Buffer, resource: Buffer.from(small.buffer) },
      { type: Uint8Array, resource: small },
    ],
    big: [
      { type: ArrayBuffer, resource: big.buffer },
      { type: Buffer, resource: Buffer.from(big.buffer) },
      { type: Uint8Array, resource: big },
    ],
  };

  return result;
};

generateFunctionalTests('client-node', makeTanker, generateTestResources);
