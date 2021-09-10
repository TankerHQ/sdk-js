import { InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { toBase64, fromBase64, prehashPassword } from '../utils';

const notStringTypes = [undefined, null, 0, {}, [], new Uint8Array(0)];
const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'wat'];

describe('utils (core)', () => {
  // Note: the correct behavior of these utils is already tested in @tanker/crypto,
  //       so we just need to check that InvalidArgument is thrown when needed.
  describe('argument checking for utils from @tanker/crypto', () => {
    it('should throw when toBase64 is given an invalid type', () => {
      // $FlowExpectedError
      notUint8ArrayTypes.forEach((v, i) => expect(() => toBase64(v), `#${i}`).to.throw(InvalidArgument));
    });

    it('should throw when fromBase64 is given an invalid type', () => {
      // $FlowExpectedError
      notStringTypes.forEach((v, i) => expect(() => fromBase64(v), `#${i}`).to.throw(InvalidArgument));
    });

    it('should throw when prehashPassword is given an invalid type', async () => {
      // $FlowExpectedError
      await Promise.all(notStringTypes.map((v, i) => expect(prehashPassword(v), `#${i}`).to.be.rejectedWith(InvalidArgument)));
    });
  });
});
