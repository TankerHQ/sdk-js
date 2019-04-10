// @flow

import uuid from 'uuid';
import { expect } from 'chai';

import { toBase64 } from '../../../../packages/client-node';
import { upgradeUserToken } from '../../../../packages/identity';
import { TrustchainHelper } from '../../../../packages/functional-tests/src/Helpers';
import { makeCurrentUser, makeV1User } from './helpers';

function generateEncryptTest(args: any) {
  it(`encrypts in ${args.version} and decrypts with current code`, async () => {
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
}

function generateGroupTest(args: any) {
  it(`encrypts and shares with a group in ${args.version} and decrypts with current code`, async () => {
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
}

function generateUnlockTest(args: any) {
  it(`registers unlock with ${args.version} and unlocks with current code`, async () => {
    const phone = makeCurrentUser(args.currentBob.id, args.currentBob.identity, args.trustchainId, 'phone');
    await phone.signIn();
    await phone.signOut();
  });
}

const generatorMap = {
  encrypt: generateEncryptTest,
  group: generateGroupTest,
  unlock: generateUnlockTest,
};

function generateTests(opts: any) {
  describe(opts.version, function () { // eslint-disable-line func-names
    this.timeout(30000);
    const args = { version: opts.version };

    before(async () => {
      args.trustchainHelper = await TrustchainHelper.newTrustchain();
      args.trustchainId = toBase64(args.trustchainHelper.trustchainId);
      const aliceId = uuid.v4();
      const bobId = uuid.v4();
      const trustchainPrivateKey = toBase64(args.trustchainHelper.trustchainKeyPair.privateKey);
      const aliceToken = opts.generateUserToken(args.trustchainId, trustchainPrivateKey, aliceId);
      const bobToken = opts.generateUserToken(args.trustchainId, trustchainPrivateKey, bobId);
      const aliceIdentity = await upgradeUserToken(args.trustchainId, aliceId, aliceToken);
      const bobIdentity = await upgradeUserToken(args.trustchainId, bobId, bobToken);
      args.currentBob = makeCurrentUser(bobId, bobIdentity, args.trustchainId);
      args.versionBob = makeV1User(opts.Tanker, bobId, bobToken, args.trustchainId);
      args.currentAlice = makeCurrentUser(aliceId, aliceIdentity, args.trustchainId);
      args.versionAlice = makeV1User(opts.Tanker, aliceId, aliceToken, args.trustchainId);
      await args.versionBob.create();
      await args.versionBob.close();
      await args.versionAlice.create();
      await args.versionAlice.close();
    });

    after(async () => {
      await args.trustchainHelper.cleanup();
    });

    opts.tests.forEach(test => generatorMap[test](args));
  });
}

module.exports = generateTests;
