// @flow
import { tcrypto, utils, generichash, aead } from '@tanker/crypto';

import { expect } from './chai';
import { makeBuffer } from './utils';

import { getSignData, ghostDeviceToUnlockKey, createUnlockKeyMessage } from '../Unlock/unlock';

describe('unlock', () => {
  it('can convert a ghost device to unlock key', async () => {
    const ghostDevice = {
      deviceId: makeBuffer('devid', tcrypto.HASH_SIZE),
      privateSignatureKey: makeBuffer('sigkey', tcrypto.SIGNATURE_PRIVATE_KEY_SIZE),
      privateEncryptionKey: makeBuffer('enckey', tcrypto.ENCRYPTION_PRIVATE_KEY_SIZE),
    };

    const unlockKey = await ghostDeviceToUnlockKey(ghostDevice);
    expect(unlockKey).to.equal('eyJkZXZpY2VJZCI6IlpHVjJhV1FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE9IiwicHJpdmF0ZVNpZ25hdHVyZUtleSI6ImMybG5hMlY1QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBPT0iLCJwcml2YXRlRW5jcnlwdGlvbktleSI6IlpXNWphMlY1QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE9In0=');
  });

  it('can generate an unlock key message', async () => {
    const trustchainId = utils.toBase64(makeBuffer('trustchainid', tcrypto.HASH_SIZE));
    const unlockKey = 'my unlock key';
    const email = 'john@doe.com';
    const password = 'pass';
    const userSecret = makeBuffer('usersecret', tcrypto.SYMMETRIC_KEY_SIZE);

    const senderDeviceId = utils.toBase64(makeBuffer('my device id', tcrypto.HASH_SIZE));
    const senderSignatureKeyPair = tcrypto.makeSignKeyPair();

    const unlockKeyMessage = await createUnlockKeyMessage({
      trustchainId,
      deviceId: senderDeviceId,
      email,
      password,
      unlockKey,
      userSecret,
      privateSigKey: senderSignatureKeyPair.privateKey,
    });

    expect(unlockKeyMessage.trustchainId).to.deep.equal(trustchainId);
    expect(unlockKeyMessage.deviceId).to.deep.equal(senderDeviceId);
    expect(unlockKeyMessage.claims.email).to.deep.equal(utils.fromString(email));
    expect(unlockKeyMessage.claims.password).to.deep.equal(generichash(utils.fromString(password)));
    //$FlowIKnow
    expect(utils.toString(await aead.decryptAEADv2(userSecret, unlockKeyMessage.claims.unlockKey))).to.deep.equal(unlockKey);

    const signedBuffer = getSignData(unlockKeyMessage);
    expect(tcrypto.verifySignature(signedBuffer, unlockKeyMessage.signature, senderSignatureKeyPair.publicKey)).to.equal(true);
  });
});
