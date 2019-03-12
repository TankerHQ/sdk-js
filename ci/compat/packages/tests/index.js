// @flow

import uuid from 'uuid';
import { expect } from 'chai';

import { utils, type b64string } from '../../../../packages/crypto';
import { createIdentity, _deserializeIdentity } from '../../../../packages/identity';
import { TrustchainHelper } from '../../../../packages/functional-tests/src/Helpers';
import { makeCurrentUser, makeUser } from './helpers';

/* eslint-disable camelcase */
async function generateUserToken(trustchainId: b64string, trustchainPrivateKey: b64string, userId: string): Promise<b64string> {
  const identity = await createIdentity(trustchainId, trustchainPrivateKey, userId);
  const {
    ephemeral_public_signature_key,
    ephemeral_private_signature_key,
    value: user_id,
    delegation_signature,
    user_secret,
  } = _deserializeIdentity(identity);

  return utils.toB64Json({
    delegation_signature,
    ephemeral_public_signature_key,
    ephemeral_private_signature_key,
    user_id,
    user_secret,
  });
}
/* eslint-disable enable */

function generateTests(version: string, Tanker: any) {
  describe(version, function () { // eslint-disable-line func-names
    this.timeout(30000);
    const args = {};

    before(async () => {
      args.trustchainHelper = await TrustchainHelper.newTrustchain();
      args.trustchainId = utils.toBase64(args.trustchainHelper.trustchainId);
      const aliceId = uuid.v4();
      const bobId = uuid.v4();
      const trustchainPrivateKey = args.trustchainHelper.trustchainKeyPair.trustchainPrivateKey;
      const aliceToken = await generateUserToken(args.trustchainId, trustchainPrivateKey, aliceId);
      const bobToken = await generateUserToken(args.trustchainId, trustchainPrivateKey, bobId);
      args.currentBob = makeCurrentUser(bobId, bobToken, args.trustchainId);
      args.versionBob = makeUser(Tanker, bobId, bobToken, args.trustchainId);
      args.currentAlice = makeCurrentUser(aliceId, aliceToken, args.trustchainId);
      args.versionAlice = makeUser(Tanker, aliceId, aliceToken, args.trustchainId);
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

      await args.currentBob.open();
      let decryptedData = await args.currentBob.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      await args.currentBob.close();

      await args.currentAlice.open();
      decryptedData = await args.currentAlice.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      await args.currentAlice.close();
    });

    it(`encrypts and shares with a group in ${version} and decrypts with current code`, async () => {
      let message = 'secret message for a group';
      await args.versionAlice.open();
      const groupId = await args.versionAlice.createGroup([args.versionBob.id, args.versionAlice.id]);
      let encryptedData = await args.versionAlice.encrypt(message, [], [groupId]);
      await args.versionAlice.close();

      await args.currentBob.open();
      let decryptedData = await args.currentBob.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);

      await args.currentAlice.open();
      decryptedData = await args.currentAlice.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      message = 'another secret message for a group';
      encryptedData = await args.currentAlice.encrypt(message, [], [groupId]);
      await args.currentAlice.close();

      decryptedData = await args.currentBob.decrypt(encryptedData);
      expect(decryptedData).to.equal(message);
      await args.currentBob.close();
    });

    it(`registers unlock with ${version} and unlocks with current code`, async () => {
      const phone = makeCurrentUser(args.versionBob.id, args.versionBob.token, args.trustchainId, 'phone');
      await phone.open();
      await phone.close();
    });
  });
}

module.exports = generateTests;
