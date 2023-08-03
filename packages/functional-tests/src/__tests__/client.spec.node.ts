import Tanker from '@tanker/client-node';
import { pouchDBMemory } from '@tanker/datastore-pouchdb-memory';

import type { b64string } from '@tanker/core';

import type { DefaultDownloadType, TestResources } from '../helpers';
import { appdUrl, makeRandomUint8Array } from '../helpers';
import { generateFunctionalTests } from '..';

const makeTanker = (appId: b64string, storagePrefix: string): Tanker => {
  const tanker = new Tanker({
    appId,
    dataStore: { adapter: pouchDBMemory, prefix: storagePrefix },
    sdkType: 'js-functional-tests-node',
    url: appdUrl,
  });

  return tanker;
};

const generateTestResources = (): { resources: TestResources; defaultDownloadType: DefaultDownloadType; } => {
  const kB = 1024;
  const MB = kB * kB;

  const empty = makeRandomUint8Array(0); // 0B -> this will use v3 format
  const small = makeRandomUint8Array(1 * kB); // 1kB -> this will use v3 format
  const medium = makeRandomUint8Array(1 * MB); // 1MB -> this will use v4 format with 2 chunks
  const big = makeRandomUint8Array(6 * MB); // 6MB -> this will use v4 format with 7 chunks

  const isAfterNode20 = parseInt(process.versions.node.split('.')[0]!) >= 20;

  const resources: TestResources = {
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

  if (isAfterNode20) {
    Object.keys(resources).forEach((size) => {
      const data = resources[size as keyof TestResources];
      const uint8array = data[data.length - 1]!;
      data.push({ size: uint8array.size, type: Blob, resource: new Blob([uint8array.resource], { type: 'application/octet-stream' }) });
      data.push({ size: uint8array.size, type: File, resource: new File([uint8array.resource], '', { type: 'application/octet-stream' }) });
    });
  }

  return {
    defaultDownloadType: isAfterNode20 ? File : Uint8Array,
    resources: resources,
  };
};

generateFunctionalTests('client-node', makeTanker, generateTestResources);
