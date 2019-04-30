// @flow
import sinon from 'sinon';
import { tcrypto, random, utils } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';

import { expect } from './chai';

import Trustchain from '../Trustchain/Trustchain';
import { Client } from '../Network/Client';
import { SessionOpener, SIGN_IN_RESULT, OPEN_MODE } from '../Session/SessionOpener';
import Storage from '../Session/Storage';
import { extractUserData } from '../UserData';

class MockStorage {
  keyStore;
  userStore;

  constructor() {
    const signatureKeyPair = tcrypto.makeSignKeyPair();
    const encryptionKeyPair = tcrypto.makeEncryptionKeyPair();
    const userKeyPair = tcrypto.makeEncryptionKeyPair();
    this.keyStore = {
      publicSignatureKey: signatureKeyPair.publicKey,
      privateSignatureKey: signatureKeyPair.privateKey,
      publicEncryptionKey: encryptionKeyPair.publicKey,
      signatureKeyPair,
      encryptionKeyPair,
      wasRevoked: false,
      deviceId: random(tcrypto.HASH_SIZE),
      userKeys: [userKeyPair]
    };
    this.userStore = {
      setCallbacks: () => {},
    };
  }
  hasLocalDevice = () => true;
  close = () => {};
}
class MockClient {
  setAuthenticator = () => {};
  userExists = () => true;
  subscribeToCreation = () => {};
  sendBlock = sinon.spy();
}
class MockTrustchain {
  ready = () => {};
}

describe('Session opening', () => {
  let mockStorage: Storage;
  let mockClient: Client;
  let mockTrustchain: Trustchain;
  let sessionOpener;
  let trustchainId;
  let trustchainKeyPair;

  before(() => {
    trustchainId = random(tcrypto.HASH_SIZE);
    trustchainKeyPair = tcrypto.makeSignKeyPair();
  });

  beforeEach(() => {
    mockStorage = (new MockStorage(): any);
    mockClient = (new MockClient(): any);
    mockTrustchain = (new MockTrustchain(): any);
  });

  describe('for user', () => {
    let userIdString;
    let identity;
    let userData;

    before(async () => {
      userIdString = 'clear user id';
      identity = await createIdentity(utils.toBase64(trustchainId), utils.toBase64(trustchainKeyPair.privateKey), userIdString);
      userData = extractUserData(identity);
    });

    beforeEach(() => {
      sessionOpener = new SessionOpener(userData, mockStorage, mockTrustchain, mockClient);
    });

    it('should succeed if everything is well', async () => {
      await expect(sessionOpener.openSession(OPEN_MODE.SIGN_UP)).to.be.fulfilled;
    });

    it('should block open and return identity_verification_needed status if user exists but does not have a local device', async () => {
      // $FlowIKnow
      mockStorage.hasLocalDevice = () => false;

      const openResult = await sessionOpener.openSession(OPEN_MODE.SIGN_IN);
      expect(openResult.signInResult).to.equal(SIGN_IN_RESULT.IDENTITY_VERIFICATION_NEEDED);
    });

    it('should create account if user does not exist', async () => {
      // $FlowIKnow
      mockStorage.hasLocalDevice = () => false;
      // $FlowIKnow
      mockClient.userExists = () => false;

      const openResult = await sessionOpener.openSession(OPEN_MODE.SIGN_UP);
      expect(openResult.signInResult).to.equal(SIGN_IN_RESULT.OK);
      // $FlowIKnow
      expect(mockClient.sendBlock.calledOnce).to.be.true;
    });
  });
});
