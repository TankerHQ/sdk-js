// @flow
import type { Tanker } from '@tanker/core';
import { encryptionV4 } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { getConstructor } from '@tanker/types';

type spyObj = {
  callCount: number,
  getCall: (step: number) => { args: Array<mixed> },
};

export const expectProgressReport = (
  spy: spyObj,
  totalBytes: number,
  maxBytesPerStep: number = encryptionV4.defaultMaxEncryptedChunkSize,
) => {
  // add 1 for initial progress report (currentBytes = 0)
  const stepCount = 1 + (totalBytes === 0 ? 1 : Math.ceil(totalBytes / maxBytesPerStep));
  expect(spy.callCount).to.equal(stepCount);

  let currentBytes = 0;
  for (let step = 0; step < stepCount - 1; step++) {
    expect(spy.getCall(step).args).to.deep.equal([{ currentBytes, totalBytes }]);
    currentBytes += maxBytesPerStep;
  }
  expect(spy.getCall(stepCount - 1).args).to.deep.equal([{ currentBytes: totalBytes, totalBytes }]);
};

// In Edge and IE11, accessing the webkitRelativePath property on File instances triggers
// a "TypeError: Invalid calling object", although the property exists. We avoid this error
// by comparing only a subset of useful File properties:
const fileProps = (obj: Object) => {
  const { name, size, type, lastModified } = obj;
  return { name, size, type, lastModified };
};

export const expectType = (obj: Object, type: Object) => expect(getConstructor(obj)).to.equal(type);

export const expectSameType = (a: Object, b: Object) => expect(getConstructor(a)).to.equal(getConstructor(b));

export const expectDeepEqual = (a: Object, b: Object) => {
  if (global.File && a instanceof File) {
    expect(fileProps(a)).to.deep.equal(fileProps(b));
    return;
  }
  expect(a).to.deep.equal(b);
};

export const expectDecrypt = async (sessions: Array<Tanker>, clear: string, encrypted: Uint8Array) => {
  for (const session of sessions) {
    expect(await session.decrypt(encrypted)).to.equal(clear);
  }
};
