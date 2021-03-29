// @flow
import crypto from 'crypto';
import { toBase64 } from './utils';
import { type b64string } from './aliases';

export function random(size: number): Uint8Array {
  // Calling getRandomValues() with a zero-length buffer throws InvalidStateError on Edge
  if (size === 0)
    return new Uint8Array(0);

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

// A string with enough entropy to not collide or be guessable
export function randomBase64Token(): b64string {
  return toBase64(random(16));
}
