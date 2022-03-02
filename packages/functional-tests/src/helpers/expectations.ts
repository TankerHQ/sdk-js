import type { Tanker } from '@tanker/core';
import { encryptionV4 } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';

import { getConstructor } from '@tanker/types';
import type { Data, Class } from '@tanker/types';

type SpyObj = {
  callCount: number;
  getCall: (step: number) => { args: Array<unknown>; };
};

export const expectProgressReport = (
  spy: SpyObj,
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

export const expectType = (obj: Data, type: Class<Data>) => expect(getConstructor(obj)).to.equal(type);

export const expectSameType = (a: Data, b: Data) => expect(getConstructor(a)).to.equal(getConstructor(b));

export const expectDeepEqual = (a: Record<string, any>, b: Record<string, any>) => {
  if (global.File && a instanceof File) {
    expect(a).to.deep.equal(b);
    return;
  }
  expect(a).to.deep.equal(b);
};

export const expectDecrypt = async (sessions: Array<Tanker>, clear: string, encrypted: Uint8Array) => {
  for (const session of sessions) {
    expect(await session.decrypt(encrypted)).to.equal(clear);
  }
};
