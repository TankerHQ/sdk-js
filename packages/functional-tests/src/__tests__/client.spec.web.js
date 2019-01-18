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
  const small = makeRandomUint8Array(1024); // 1kB
  const big = makeRandomUint8Array(6 * 1024 * 1024); // 6MB

  const result = {
    small: {
      ArrayBuffer: small.buffer,
      Blob: new Blob([small], { type: 'application/octet-stream' }),
      File: new FilePonyfill([small], 'report.pdf', { type: 'application/pdf' }),
      Uint8Array: small,
    },
    big: {
      ArrayBuffer: big.buffer,
      Blob: new Blob([big], { type: 'application/octet-stream' }),
      File: new FilePonyfill([big], 'holidays.mp4', { type: 'video/mp4' }),
      Uint8Array: big,
    }
  };

  return result;
};

generateFunctionalTests('client-browser', makeTanker, generateTestResources);
