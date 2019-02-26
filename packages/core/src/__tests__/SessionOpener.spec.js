// @flow

import sinon from 'sinon';

import { tcrypto, random } from '@tanker/crypto';

import { expect } from './chai';

import { extractUserData } from '../Tokens/UserData';
import { createUserToken } from './TestSessionTokens';

import { SessionOpener } from '../Session/SessionOpener';

import { OperationCanceled, MissingEventHandler } from '../errors';

import Trustchain from '../Trustchain/Trustchain';
import { Client } from '../Network/Client';
import Storage from '../Session/Storage';

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
      setLocalUser: () => {},
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
    let userToken;
    let userData;

    before(() => {
      userIdString = 'clear user id';
      userToken = createUserToken(trustchainId, userIdString, trustchainKeyPair.privateKey);
      userData = extractUserData(trustchainId, userIdString, userToken);
    });

    beforeEach(() => {
      sessionOpener = new SessionOpener(userData, mockStorage, mockTrustchain, mockClient);
    });

    it('should succeed if everything is well', async () => {
      await expect(sessionOpener.openSession(false)).to.be.fulfilled;
    });

    it('should block open and emit the unlockRequired event if user exists but does not have a local device', async () => {
      // $FlowIKnow
      mockStorage.hasLocalDevice = () => false;

      const eventPromise = new Promise(async (resolve, reject) => {
        sessionOpener.on('unlockRequired', () => {
          setTimeout(resolve, 10);
        });
        await expect(sessionOpener.openSession(true)).to.be.rejectedWith(OperationCanceled);
        reject();
      });

      // new device
      await expect(eventPromise).to.be.fulfilled;
    });

    it('should create account if user does not exist', async () => {
      // $FlowIKnow
      mockStorage.hasLocalDevice = () => false;
      // $FlowIKnow
      mockClient.userExists = () => false;

      await expect(sessionOpener.openSession(false)).to.be.fulfilled;
      // $FlowIKnow
      expect(mockClient.sendBlock.calledOnce).to.be.true;
    });

    it('should throw if unlockRequired event has no handler', async () => {
      // $FlowIKnow
      mockStorage.hasLocalDevice = () => false;
      // Oops, we forgot to listen on 'unlockRequired'
      await expect(sessionOpener.openSession(false)).to.be.rejectedWith(MissingEventHandler);
    });
  });
});
