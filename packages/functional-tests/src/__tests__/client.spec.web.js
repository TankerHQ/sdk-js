// @flow
import Tanker from '@tanker/client-browser';
import { type TankerInterface, type b64string } from '@tanker/core';
import FilePonyfill from '@tanker/file-ponyfill';

import { tankerUrl, makePrefix, makeRandomUint8Array } from '../Helpers';
import { generateFunctionalTests } from '../functional';
import { type TestResources } from '../TestArgs';

const makeTanker = (trustchainId: b64string): TankerInterface => {
  const tanker: TankerInterface = (new Tanker({
    trustchainId,
    // $FlowIKnow adapter key is passed as a default option by @tanker/client-browser
    dataStore: { prefix: makePrefix() },
    sdkType: 'test',
    url: tankerUrl,
  }): any);

  return tanker;
};

const generateTestResources = (): TestResources => {
  const small = makeRandomUint8Array(1024); // 1kB -> this will use v3 format
  const medium = makeRandomUint8Array(1024 * 1024); // 1MB -> this will use v4 format with 2 chunks
  const big = makeRandomUint8Array(6 * 1024 * 1024); // 6MB -> this will use v4 format with 7 chunks

  const result = {
    small: [
      { type: ArrayBuffer, resource: small.buffer },
      { type: Blob, resource: new Blob([small], { type: 'application/octet-stream' }) },
      { type: File, resource: new FilePonyfill([small], 'report.pdf', { type: 'application/pdf' }) },
      { type: Uint8Array, resource: small },
    ],
    medium: [
      { type: ArrayBuffer, resource: medium.buffer },
      { type: Blob, resource: new Blob([medium], { type: 'application/octet-stream' }) },
      { type: File, resource: new FilePonyfill([medium], 'picture.jpeg', { type: 'image/jpeg' }) },
      { type: Uint8Array, resource: medium },
    ],
    big: [
      { type: ArrayBuffer, resource: big.buffer },
      { type: Blob, resource: new Blob([big], { type: 'application/octet-stream' }) },
      { type: File, resource: new FilePonyfill([big], 'holidays.mp4', { type: 'video/mp4' }) },
      { type: Uint8Array, resource: big },
    ],
  };

  return result;
};

generateFunctionalTests('client-browser', makeTanker, generateTestResources);
