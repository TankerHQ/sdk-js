import type { EncryptionOptions } from '@tanker/core';
import { random } from '@tanker/crypto';
import { Tanker, errors } from '@tanker/core';
import { expect } from '@tanker/test-utils';

import type { UserSession } from './session';

export type EncryptedBuffer = {
  clearData: Uint8Array,
  encryptedData: Uint8Array,
};

export const encrypt = async (session: Tanker, options: EncryptionOptions): Promise<EncryptedBuffer> => {
  const clearData = random(24); // arbitrary size
  const encryptedData = await session.encryptData(clearData, options);
  return { clearData, encryptedData };
};

export const checkDecrypt = async (userSessions: Array<UserSession>, buffers: Array<EncryptedBuffer>) => {
  for (const [i, userSession] of userSessions.entries()) {
    for (const buffer of buffers) {
      await expect(userSession.session.decryptData(buffer.encryptedData), `user ${i} should be able to decrypt`).to.eventually.deep.equal(buffer.clearData);
    }
  }
};

export const checkDecryptFails = async (userSessions: Array<UserSession>, buffers: Array<EncryptedBuffer>) => {
  for (const [i, userSession] of userSessions.entries()) {
    for (const buffer of buffers) {
      await expect(userSession.session.decryptData(buffer.encryptedData), `user ${i} should not be able to decrypt`).to.be.rejectedWith(errors.InvalidArgument, 'could not find key for resource');
    }
  }
};
