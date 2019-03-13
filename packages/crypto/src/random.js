// @flow
import crypto from 'crypto';

export function random(size: number): Uint8Array {
  if (typeof window !== 'undefined') {
    const myCrypto = window.crypto || window.msCrypto;

    if (myCrypto && myCrypto.getRandomValues) {
      const buffer = new Uint8Array(size);
      myCrypto.getRandomValues(buffer);
      return buffer;
    }
  }

  return new Uint8Array(crypto.randomBytes(size));
}
