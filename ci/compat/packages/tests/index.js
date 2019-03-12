// @flow

import uuid from 'uuid';
import { expect } from 'chai';

import { toBase64 } from '../../../../packages/client-node';
import { upgradeUserToken } from '../../../../packages/identity';
import { TrustchainHelper } from '../../../../packages/functional-tests/src/Helpers';
import { makeCurrentUser, makeUser } from './helpers';

function generateTests(version: string, Tanker: any, generateUserToken: any) {
  describe(version, function () { // eslint-disable-line func-names
    this.timeout(30000);
    const args = {};

    before(async () => {
      args.trustchainHelper = await TrustchainHelper.newTrustchain();
      args.trustchainId = toBase64(args.trustchainHelper.trustchainId);
      const aliceId = uuid.v4();
      const bobId = uuid.v4();
      const trustchainPrivateKey = toBase64(args.trustchainHelper.trustchainKeyPair.privateKey);
      const aliceToken = generateUserToken(args.trustchainId, trustchainPrivateKey, aliceId);
      const bobToken = generateUserToken(args.trustchainId, trustchainPrivateKey, bobId);
      const aliceIdentity = await upgradeUserToken(args.trustchainId, aliceId, aliceToken);
      const bobIdentity = await upgradeUserToken(args.trustchainId, bobId, bobToken);
      args.currentBob = makeCurrentUser(bobId, bobToken, bobIdentity, args.trustchainId);
      args.versionBob = makeUser(Tanker, bobId, bobToken, bobIdentity, args.trustchainId);
      args.currentAlice = makeCurrentUser(aliceId, aliceToken, aliceIdentity, args.trustchainId);
      args.versionAlice = makeUser(Tanker, aliceId, aliceToken, aliceIdentity, args.trustchainId);
      await args.versionBob.create();
      await args.versionBob.close();
      await args.versionAlice.create();
      await args.versionAlice.close();
    });

    after(async () => {
      await args.trustchainHelper.cleanup();
    });

    it(`encrypts in ${version} and decrypts with current code`, async () => {
      const message = 'secret message';
      await args.versionAlice.open();
      const encryptedData = await args.versionAlice.encrypt(message, [args.versionBob.id], []);
      await args.versionAlice.close();

      await args.currentBob.signIn();
      let decryptedData = await args.currentBob.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      await args.currentBob.signOut();

      await args.currentAlice.signIn();
      decryptedData = await args.currentAlice.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      await args.currentAlice.signOut();
    });

    it(`encrypts and shares with a group in ${version} and decrypts with current code`, async () => {
      let message = 'secret message for a group';
      await args.versionAlice.open();
      const groupId = await args.versionAlice.createGroup([args.versionBob.id, args.versionAlice.id]);
      let encryptedData = await args.versionAlice.encrypt(message, [], [groupId]);
      await args.versionAlice.close();

      await args.currentBob.signIn();
      let decryptedData = await args.currentBob.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);

      await args.currentAlice.signIn();
      decryptedData = await args.currentAlice.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      message = 'another secret message for a group';
      encryptedData = await args.currentAlice.encrypt(message, [], [groupId]);
      await args.currentAlice.signOut();

      decryptedData = await args.currentBob.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      await args.currentBob.signOut();
    });

    it(`registers unlock with ${version} and unlocks with current code`, async () => {
      const phone = makeCurrentUser(args.versionBob.id, args.versionBob.token, args.versionBob.identity, args.trustchainId, 'phone');
      await phone.signIn();
      await phone.signOut();
    });
  });
}

module.exports = generateTests;
