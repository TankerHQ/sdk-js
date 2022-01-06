import Tanker from '@tanker/client-node';
import PouchDBMemory from '@tanker/datastore-pouchdb-memory';

import type { b64string } from '@tanker/core';

import type { TestResources } from '../helpers';
import { appdUrl, makeRandomUint8Array } from '../helpers';
import { generateFunctionalTests } from '..';

const makeTanker = (appId: b64string, storagePrefix: string): Tanker => {
  const tanker = new Tanker({
    appId,
    dataStore: { adapter: PouchDBMemory, prefix: storagePrefix },
    sdkType: 'js-functional-tests-node',
    url: appdUrl,
  });

  return tanker;
};

const generateTestResources = (): TestResources => {
  const kB = 1024;
  const MB = kB * kB;

  const empty = makeRandomUint8Array(0); // 0B -> this will use v3 format
  const small = makeRandomUint8Array(1 * kB); // 1kB -> this will use v3 format
  const medium = makeRandomUint8Array(1 * MB); // 1MB -> this will use v4 format with 2 chunks
  const big = makeRandomUint8Array(6 * MB); // 6MB -> this will use v4 format with 7 chunks

  return {
    empty: [
      { size: empty.length, type: ArrayBuffer, resource: empty.buffer },
      { size: empty.length, type: Buffer, resource: Buffer.from(empty.buffer) },
      { size: empty.length, type: Uint8Array, resource: empty },
    ],
    small: [
      { size: small.length, type: ArrayBuffer, resource: small.buffer },
      { size: small.length, type: Buffer, resource: Buffer.from(small.buffer) },
      { size: small.length, type: Uint8Array, resource: small },
    ],
    medium: [
      { size: medium.length, type: ArrayBuffer, resource: medium.buffer },
      { size: medium.length, type: Buffer, resource: Buffer.from(medium.buffer) },
      { size: medium.length, type: Uint8Array, resource: medium },
    ],
    big: [
      { size: big.length, type: ArrayBuffer, resource: big.buffer },
      { size: big.length, type: Buffer, resource: Buffer.from(big.buffer) },
      { size: big.length, type: Uint8Array, resource: big },
    ],
  };
};

generateFunctionalTests('client-node', makeTanker, generateTestResources);
