import Tanker from '@tanker/client-browser';
import FilePonyfill from '@tanker/file-ponyfill';

import type { b64string } from '@tanker/core';

import type { TestResources } from '../helpers';
import { appdUrl, makePrefix, makeRandomUint8Array } from '../helpers';
import { generateFunctionalTests } from '..';

const makeTanker = (appId: b64string): Tanker => {
  const tanker = new Tanker({
    appId,
    dataStore: { prefix: makePrefix() },
    sdkType: 'js-functional-tests-web',
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

  const result: TestResources = {
    empty: [
      { size: empty.length, type: ArrayBuffer, resource: empty.buffer },
      { size: empty.length, type: Blob, resource: new Blob([empty], { type: 'application/octet-stream' }) },
      { size: empty.length, type: File, resource: new FilePonyfill([empty], 'empty.txt', { type: 'text/plain' }) },
      { size: empty.length, type: Uint8Array, resource: empty },
    ],
    small: [
      { size: small.length, type: ArrayBuffer, resource: small.buffer },
      { size: small.length, type: Blob, resource: new Blob([small], { type: 'application/octet-stream' }) },
      { size: small.length, type: File, resource: new FilePonyfill([small], 'report.pdf', { type: 'application/pdf' }) },
      { size: small.length, type: Uint8Array, resource: small },
    ],
    medium: [
      { size: medium.length, type: ArrayBuffer, resource: medium.buffer },
      { size: medium.length, type: Blob, resource: new Blob([medium], { type: 'application/octet-stream' }) },
      { size: medium.length, type: File, resource: new FilePonyfill([medium], 'picture.jpeg', { type: 'image/jpeg' }) },
      { size: medium.length, type: Uint8Array, resource: medium },
    ],
    big: [
      { size: big.length, type: ArrayBuffer, resource: big.buffer },
      { size: big.length, type: Blob, resource: new Blob([big], { type: 'application/octet-stream' }) },
      { size: big.length, type: File, resource: new FilePonyfill([big], 'holidays.mp4', { type: 'video/mp4' }) },
      { size: big.length, type: Uint8Array, resource: big },
    ],
  };

  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
    // @ts-expect-error 'big' is never acceced without a check
    delete result.big;
  }

  return result;
};

generateFunctionalTests('client-browser', makeTanker, generateTestResources);
