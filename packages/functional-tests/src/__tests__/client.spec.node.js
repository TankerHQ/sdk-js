// @flow
import Tanker from '@tanker/client-node';
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';

import type { b64string } from '@tanker/core';

import { tankerUrl, makePrefix, makeRandomUint8Array } from '../Helpers';
import { generateFunctionalTests } from '../functional';
import { type TestResources } from '../TestArgs';

const makeTanker = (appId: b64string): Tanker => {
  const tanker = new Tanker({
    appId,
    dataStore: { adapter: PouchDBMemory, prefix: makePrefix() },
    sdkType: 'test',
    url: tankerUrl,
  });

  return tanker;
};

const generateTestResources = (): TestResources => {
  const sizes = [1024, 1024 * 1024, 6 * 1024 * 1024];

  const small = makeRandomUint8Array(sizes[0]); // 1kB -> this will use v3 format
  const medium = makeRandomUint8Array(sizes[1]); // 1MB -> this will use v4 format with 2 chunks
  const big = makeRandomUint8Array(sizes[2]); // 6MB -> this will use v4 format with 7 chunks

  return {
    small: [
      { size: sizes[0], type: ArrayBuffer, resource: small.buffer },
      { size: sizes[0], type: Buffer, resource: Buffer.from(small.buffer) },
      { size: sizes[0], type: Uint8Array, resource: small },
    ],
    medium: [
      { size: sizes[1], type: ArrayBuffer, resource: medium.buffer },
      { size: sizes[1], type: Buffer, resource: Buffer.from(medium.buffer) },
      { size: sizes[1], type: Uint8Array, resource: medium },
    ],
    big: [
      { size: sizes[2], type: ArrayBuffer, resource: big.buffer },
      { size: sizes[2], type: Buffer, resource: Buffer.from(big.buffer) },
      { size: sizes[2], type: Uint8Array, resource: big },
    ],
  };
};

generateFunctionalTests('client-node', makeTanker, generateTestResources);
