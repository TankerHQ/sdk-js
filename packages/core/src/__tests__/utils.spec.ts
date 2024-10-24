import { InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { toBase64, fromBase64, prehashPassword, prehashAndEncryptPassword } from '../utils';
import { tcrypto, random, generichash, utils as cryptoUtils } from '@tanker/crypto';

const notStringTypes = [undefined, null, 0, {}, [], new Uint8Array(0)];
const notUint8ArrayTypes = [undefined, null, 0, {}, [], 'wat'];

describe('utils (core)', () => {
  // Note: the correct behavior of these utils is already tested in @tanker/crypto,
  //       so we just need to check that InvalidArgument is thrown when needed.
  describe('argument checking for utils from @tanker/crypto', () => {
    it('should throw when toBase64 is given an invalid type', () => {
      // @ts-expect-error
      notUint8ArrayTypes.forEach((v, i) => expect(() => toBase64(v), `#${i}`).to.throw(InvalidArgument));
    });

    it('should throw when fromBase64 is given an invalid type', () => {
      // @ts-expect-error
      notStringTypes.forEach((v, i) => expect(() => fromBase64(v), `#${i}`).to.throw(InvalidArgument));
    });

    it('should throw when prehashPassword is given an invalid type', async () => {
      // @ts-expect-error
      await Promise.all(notStringTypes.map((v, i) => expect(prehashPassword(v), `#${i}`).to.be.rejectedWith(InvalidArgument)));
    });

    it('should throw when prehashAndEncryptPassword is given an invalid password type', async () => {
      const keyPair = tcrypto.makeEncryptionKeyPair();
      const publicKey = toBase64(keyPair.publicKey);
      // @ts-expect-error
      await Promise.all(notStringTypes.map((v, i) => expect(prehashAndEncryptPassword(v, publicKey), `#${i}`).to.be.rejectedWith(InvalidArgument)));
    });

    it('should throw when prehashAndEncryptPassword is given an invalid public key', async () => {
      // public key is expected to be a base-64 encoded array of 32 bytes
      const invalidPublicKeys = ["I'm a teapot", toBase64(random(19))];
      await Promise.all(invalidPublicKeys.map((pk) => expect(prehashAndEncryptPassword('P@ssword1234', pk), `#${pk}`).to.be.rejectedWith(InvalidArgument)));
    });
  });

  describe('checking prehashAndEncryptPassword behavior', () => {
    it('should be able to retrieve hashed password when decrypting the result', async () => {
      const password = 'P@assword1234';
      const keyPair = tcrypto.makeEncryptionKeyPair();
      const encrypted = await prehashAndEncryptPassword(password, toBase64(keyPair.publicKey));

      const decryptedHashedPassword = tcrypto.sealDecrypt(fromBase64(encrypted), keyPair);
      const hashedPassword = generichash(cryptoUtils.fromString(password));
      expect(decryptedHashedPassword).to.deep.equal(hashedPassword);
    });
  });
});
