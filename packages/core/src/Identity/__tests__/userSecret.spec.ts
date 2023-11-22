import { type b64string, ready as cryptoReady, utils } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';
import { obfuscateUserId, createUserSecretBinary } from '@tanker/identity';

import { assertUserSecret, USER_SECRET_SIZE } from '../userSecret';

const { fromBase64, fromString } = utils;

describe('userSecret', () => {
  let trustchainId: Uint8Array;
  let trustchainIdB64: b64string;

  before(async () => {
    await cryptoReady;
    trustchainIdB64 = 'uxTyZYP8OOYP13A4GQC4zfVr7hJz5tsF7YdMpd3PT8w=';
    trustchainId = fromBase64(trustchainIdB64);
  });

  it('should throw if bad arguments given to assertUserSecret', () => {
    const userId = 'edmond';
    const hashedUserId = obfuscateUserId(trustchainId, userId);
    const secret = createUserSecretBinary(trustchainIdB64, userId);
    const tooShortSecret = new Uint8Array(USER_SECRET_SIZE - 1);
    [
      [], [undefined, secret], [hashedUserId], [hashedUserId, null], [userId, secret], [hashedUserId, tooShortSecret],
    ].forEach((badArgs, i) => {
      // @ts-expect-error
      expect(() => assertUserSecret(...badArgs), `bad args #${i}`).to.throw('Assertion error');
    });
  });

  it('should accept secrets of the right user', async () => {
    const userId = 'fernand';
    const secret = createUserSecretBinary(trustchainIdB64, userId);
    const obfuscatedUserId = obfuscateUserId(trustchainId, userId);
    expect(() => assertUserSecret(obfuscatedUserId, secret)).not.to.throw();
  });

  it('should reject invalid secrets, even with correct size', async () => {
    const secret = fromString('And our interests are the same !');
    expect(() => assertUserSecret(obfuscateUserId(trustchainId, 'danglars'), secret)).to.throw();
  });

  it('should reject secrets of the wrong user most of the time', async () => {
    const count = 10;
    let rejections = 0;

    for (let i = 0; i < count; ++i) {
      const secret = createUserSecretBinary(trustchainIdB64, 'villefort');

      try {
        assertUserSecret(obfuscateUserId(trustchainId, 'edmond'), secret);
      } catch (e) {
        rejections += 1;
      }
    }

    expect(rejections).that.which.does.have.to.be.above(count / 2);
  });
});
