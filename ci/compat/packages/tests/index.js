// @flow

import uuid from 'uuid';
import { expect } from 'chai';

import { toBase64 } from '../../../../packages/client-node';
import { upgradeUserToken } from '../../../../packages/identity';
import { TrustchainHelper } from '../../../../packages/functional-tests/src/Helpers';
import { makeCurrentUser, makeV1User } from './helpers';

function generateEncryptTest(args) {
  it(`encrypts in ${args.version} and decrypts with current code`, async () => {
    const message = 'secret message';
    const encryptedData = await args.versionAlice.encrypt(message, [args.versionBob.id], []);

    let decryptedData = await args.currentBob.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);

    decryptedData = await args.currentAlice.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);
  });
}

function generateGroupTest(args) {
  it(`encrypts and shares with a group in ${args.version} and decrypts with current code`, async () => {
    let message = 'secret message for a group';
    const groupId = await args.versionAlice.createGroup([args.versionBob.id, args.versionAlice.id]);
    let encryptedData = await args.versionAlice.encrypt(message, [], [groupId]);

    let decryptedData = await args.currentBob.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);

    decryptedData = await args.currentAlice.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);
    message = 'another secret message for a group';
    encryptedData = await args.currentAlice.encrypt(message, [], [groupId]);

    decryptedData = await args.currentBob.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);
  });
}

function generateUnlockTest(args) {
  it(`registers unlock with ${args.version} and unlocks with current code`, async () => {
    const phone = makeCurrentUser(args.currentBob.id, args.currentBob.identity, args.trustchainId, 'phone');
    await phone.signIn();
    await phone.signOut();
  });
}

function generateRevocationTest(args) {
  it(`creates a device with ${args.version} and revokes it with current code`, async () => {
    const phone = makeV1User(args.Tanker, args.versionBob.id, args.versionBob.token, args.trustchainId);
    await phone.open();
    const deviceRevoked = phone.getRevocationPromise();

    await args.currentBob.revokeDevice(phone.deviceId);
    await deviceRevoked;
    expect(phone.status).to.equal(args.Tanker.CLOSED);
  });
}

const generatorMap = {
  encrypt: generateEncryptTest,
  group: generateGroupTest,
  unlock: generateUnlockTest,
  revocation: generateRevocationTest,
};

function generateTests(opts) {
  describe(opts.version, function () { // eslint-disable-line func-names
    this.timeout(30000);
    const args = {
      version: opts.version,
      Tanker: opts.Tanker,
    };

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
      await args.versionAlice.create();
      await args.currentBob.signIn();
      await args.currentAlice.signIn();
    });

    after(async () => {
      await args.versionBob.close();
      await args.versionAlice.close();
      await args.currentBob.signOut();
      await args.currentAlice.signOut();
      await args.trustchainHelper.cleanup();
    });

    opts.tests.forEach(test => generatorMap[test](args));
  });
}

module.exports = generateTests;
