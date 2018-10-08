// @flow
import { expect } from './chai';
import { random, createUserSecretBinary, checkUserSecret, obfuscateUserId } from '../random';
import { fromBase64, fromString } from '../utils';

function assertValidSecret(userId, secret) {
  expect(() => checkUserSecret(userId, secret)).to.not.throw();
}

function assertInCorrectSecret(userId, secret) {
  expect(() => checkUserSecret(userId, secret)).to.throw();
}

const trustchainIdB64 = 'uxTyZYP8OOYP13A4GQC4zfVr7hJz5tsF7YdMpd3PT8w=';
const trustchainId = fromBase64(trustchainIdB64);

describe('random', () => {
  // Warning! This test only works 99.9999999999999999999999999999999999999999999999999999999999999999999999999991% of the time!
  it('should give two different secrets for two requests', async () => {
    const secret1 = createUserSecretBinary(trustchainIdB64, 'mondego');
    const secret2 = createUserSecretBinary(trustchainIdB64, 'mondego');
    expect(secret1).to.not.equal(secret2);
  });

  it('should accept secrets of the right user', async () => {
    const secret = createUserSecretBinary(trustchainIdB64, 'fernand');
    assertValidSecret(obfuscateUserId(trustchainId, 'fernand'), secret);
  });

  it('should reject secrets with invalid size', async () => {
    const twoshort = random(2);
    assertInCorrectSecret(obfuscateUserId(trustchainId, 'caderousse'), twoshort);
  });

  it('should reject invalid secrets, even with correct size', async () => {
    const secret = fromString('And our interests are the same !');
    assertInCorrectSecret(obfuscateUserId(trustchainId, 'danglars'), secret);
  });

  it('should reject secrets of the wrong user most of the time', async () => {
    const count = 10;
    let rejections = 0;
    for (let i = 0; i < count; ++i) {
      const secret = createUserSecretBinary(trustchainIdB64, 'villefort');
      try {
        checkUserSecret(obfuscateUserId(trustchainId, 'edmond'), secret);
      } catch (e) {
        rejections += 1;
      }
    }
    expect(rejections).that.which.does.have.to.be.above(count / 2);
  });
});
