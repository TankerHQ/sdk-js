// @flow
import Tanker from '@tanker/client-browser';
import FilePonyfill from '@tanker/file-ponyfill';

import type { b64string } from '@tanker/core';

import type { TestResources } from '../helpers';
import { tankerUrl, makePrefix, makeRandomUint8Array } from '../helpers';
import { generateFunctionalTests } from '../functional';

const makeTanker = (appId: b64string): Tanker => {
  const tanker = new Tanker({
    appId,
    // $FlowIKnow adapter key is passed as a default option by @tanker/client-browser
    dataStore: { prefix: makePrefix() },
    sdkType: 'js-functional-tests-web',
    url: tankerUrl,
  });

  return tanker;
};

const generateTestResources = (): TestResources => {
  const sizes = [0, 1024, 1024 * 1024, 6 * 1024 * 1024];

  const empty = makeRandomUint8Array(sizes[0]); // 0B -> this will use v3 format
  const small = makeRandomUint8Array(sizes[1]); // 1kB -> this will use v3 format
  const medium = makeRandomUint8Array(sizes[2]); // 1MB -> this will use v4 format with 2 chunks
  const big = makeRandomUint8Array(sizes[3]); // 6MB -> this will use v4 format with 7 chunks

  const result: TestResources = {
    empty: [
      { size: sizes[0], type: ArrayBuffer, resource: empty.buffer },
      { size: sizes[0], type: Blob, resource: new Blob([empty], { type: 'application/octet-stream' }) },
      { size: sizes[0], type: File, resource: new FilePonyfill([empty], 'empty.txt', { type: 'text/plain' }) },
      { size: sizes[0], type: Uint8Array, resource: empty },
    ],
    small: [
      { size: sizes[1], type: ArrayBuffer, resource: small.buffer },
      { size: sizes[1], type: Blob, resource: new Blob([small], { type: 'application/octet-stream' }) },
      { size: sizes[1], type: File, resource: new FilePonyfill([small], 'report.pdf', { type: 'application/pdf' }) },
      { size: sizes[1], type: Uint8Array, resource: small },
    ],
    medium: [
      { size: sizes[2], type: ArrayBuffer, resource: medium.buffer },
      { size: sizes[2], type: Blob, resource: new Blob([medium], { type: 'application/octet-stream' }) },
      { size: sizes[2], type: File, resource: new FilePonyfill([medium], 'picture.jpeg', { type: 'image/jpeg' }) },
      { size: sizes[2], type: Uint8Array, resource: medium },
    ],
    big: [
      { size: sizes[3], type: ArrayBuffer, resource: big.buffer },
      { size: sizes[3], type: Blob, resource: new Blob([big], { type: 'application/octet-stream' }) },
      { size: sizes[3], type: File, resource: new FilePonyfill([big], 'holidays.mp4', { type: 'video/mp4' }) },
      { size: sizes[3], type: Uint8Array, resource: big },
    ],
  };

  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent))
    delete result.big;

  return result;
};

generateFunctionalTests('client-browser', makeTanker, generateTestResources);
