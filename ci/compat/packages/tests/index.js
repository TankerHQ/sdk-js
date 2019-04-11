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
    const phone = makeCurrentUser({
      adapter: args.adapter,
      identity: args.currentBob.identity,
      trustchainId: args.trustchainId,
      prefix: 'phone',
    });
    await phone.signIn();
    await phone.signOut();
  });
}

function generateRevocationTest(args) {
  it(`creates a device with ${args.version} and revokes it with current code`, async () => {
    const phone = makeV1User({
      Tanker: args.Tanker,
      adapter: args.adapter,
      userId: args.versionBob.id,
      token: args.versionBob.token,
      trustchainId: args.trustchainId,
      prefix: 'phone',
    });
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
      adapter: opts.adapter,
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

      args.versionBob = makeV1User({
        Tanker: opts.Tanker,
        adapter: opts.adapter,
        trustchainId: args.trustchainId,
        userId: bobId,
        token: bobToken,
        prefix: 'bob1',
      });
      args.versionAlice = makeV1User({
        Tanker: opts.Tanker,
        adapter: opts.adapter,
        trustchainId: args.trustchainId,
        userId: aliceId,
        token: aliceToken,
        prefix: 'alice1',
      });
      args.currentBob = makeCurrentUser({
        trustchainId: args.trustchainId,
        identity: bobIdentity,
        prefix: 'bob2',
      });
      args.currentAlice = makeCurrentUser({
        trustchainId: args.trustchainId,
        identity: aliceIdentity,
        prefix: 'alice2',
      });

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
