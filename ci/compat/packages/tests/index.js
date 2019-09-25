// @flow

import uuid from 'uuid';
import { expect } from 'chai';

import { toBase64 } from '../../../../packages/client-node';
import { upgradeUserToken } from '../../../../packages/identity';
import { AppHelper } from '../../../../packages/functional-tests/src/Helpers';
import { makeCurrentUser, makeV1User, makeV2User } from './helpers';

function generateEncryptTest(args) {
  it(`encrypts in ${args.version} and decrypts with current code`, async () => {
    const message = 'secret message';
    const encryptedData = await args.versionAlice.encrypt(message, [await args.versionBob.id], []);

    let decryptedData = await args.currentBob.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);

    decryptedData = await args.currentAlice.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);
  });
}

function generateGroupTest(args) {
  it(`encrypts and shares with a group in ${args.version} and decrypts with current code`, async () => {
    let message = 'secret message for a group';
    const groupId = await args.versionAlice.createGroup([
      await args.versionBob.id,
      await args.versionAlice.id,
    ]);
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

function generateVerificationTest(args) {
  it(`registers unlock with ${args.version} and unlocks with current code`, async () => {
    const phone = makeCurrentUser({
      adapter: args.adapter,
      identity: args.currentBob.identity,
      appId: args.appId,
      prefix: 'phone',
    });
    await phone.start();
    await phone.stop();
  });
}

function generateRevocationV1Test(args) {
  it(`creates a device with ${args.version} and revokes it with current code`, async () => {
    const phone = makeV1User({
      Tanker: args.Tanker,
      adapter: args.adapter,
      userId: args.versionBob.id,
      token: args.versionBob.token,
      appId: args.appId,
      prefix: 'phone',
    });
    await phone.open();
    const deviceRevoked = phone.getRevocationPromise();

    await args.currentBob.revokeDevice(phone.deviceId);
    await deviceRevoked;
    expect(phone.status).to.equal(args.Tanker.CLOSED);
  });
}

function generateRevocationV2Test(args) {
  it(`creates a device with ${args.version} and revokes it with current code`, async () => {
    const phone = makeV2User({
      Tanker: args.Tanker,
      adapter: args.adapter,
      identity: args.currentBob.identity,
      appId: args.appId,
      prefix: 'phone',
    });
    await phone.start();
    const deviceRevoked = phone.getRevocationPromise();

    await args.currentBob.revokeDevice(phone.deviceId);
    await deviceRevoked;
    expect(phone.status).to.equal(args.Tanker.STOPPED);
  });
}

function generateFilekitTest(args) {
  it(`uploads with ${args.version} and downloads with current code`, async () => {
    const buf = Buffer.from('compat tests', 'utf8');
    const fileId = await args.versionBob.upload(buf);
    let downloaded = await args.currentBob.download(fileId);
    expect(downloaded).to.deep.equal(buf);

    await args.versionBob.share(fileId, await args.versionAlice.id);
    downloaded = await args.currentAlice.download(fileId);
    expect(downloaded).to.deep.equal(buf);
  });

  it(`uploads with current code and downloads with ${args.version}`, async () => {
    const buf = Buffer.from('compat tests', 'utf8');
    const fileId = await args.currentBob.upload(buf);
    let downloaded = await args.versionBob.download(fileId);
    expect(downloaded).to.deep.equal(buf);

    await args.currentBob.share(fileId, await args.versionAlice.id);
    downloaded = await args.versionAlice.download(fileId);
    expect(downloaded).to.deep.equal(buf);
  });
}

const generatorMap = {
  encrypt: generateEncryptTest,
  group: generateGroupTest,
  unlock: generateVerificationTest,
  verification: generateVerificationTest,
  revocationV1: generateRevocationV1Test,
  revocationV2: generateRevocationV2Test,
  filekit: generateFilekitTest,
};

function generateV1Tests(opts) {
  describe(opts.version, function () { // eslint-disable-line func-names
    this.timeout(30000);
    const args = {
      version: opts.version,
      Tanker: opts.Tanker,
      adapter: opts.adapter,
    };
    before(async () => {
      args.appHelper = await AppHelper.newApp();
      args.appId = toBase64(args.appHelper.appId);
      const aliceId = uuid.v4();
      const bobId = uuid.v4();
      const appSecret = toBase64(args.appHelper.appKeyPair.privateKey);
      const aliceToken = opts.generateUserToken(args.appId, appSecret, aliceId);
      const bobToken = opts.generateUserToken(args.appId, appSecret, bobId);
      const aliceIdentity = await upgradeUserToken(args.appId, aliceId, aliceToken);
      const bobIdentity = await upgradeUserToken(args.appId, bobId, bobToken);

      args.versionBob = makeV1User({
        Tanker: opts.Tanker,
        adapter: opts.adapter,
        appId: args.appId,
        userId: bobId,
        token: bobToken,
        prefix: 'bob1',
      });
      args.versionAlice = makeV1User({
        Tanker: opts.Tanker,
        adapter: opts.adapter,
        appId: args.appId,
        userId: aliceId,
        token: aliceToken,
        prefix: 'alice1',
      });
      args.currentBob = makeCurrentUser({
        appId: args.appId,
        identity: bobIdentity,
        prefix: 'bob2',
      });
      args.currentAlice = makeCurrentUser({
        appId: args.appId,
        identity: aliceIdentity,
        prefix: 'alice2',
      });

      await args.versionBob.create();
      await args.versionAlice.create();
      await args.currentBob.start();
      await args.currentAlice.start();
    });

    after(async () => {
      await args.versionBob.close();
      await args.versionAlice.close();
      await args.currentBob.stop();
      await args.currentAlice.stop();
      await args.appHelper.cleanup();
    });

    opts.tests.forEach(test => generatorMap[test](args));
  });
}

function generateV2Tests(opts) {
  const version = opts.Tanker.version;
  describe(version, function () { // eslint-disable-line func-names
    this.timeout(30000);
    const args = {
      version,
      Tanker: opts.Tanker,
      adapter: opts.adapter,
    };
    before(async () => {
      args.appHelper = await AppHelper.newApp();
      args.appId = toBase64(args.appHelper.appId);
      const aliceId = uuid.v4();
      const bobId = uuid.v4();
      const appSecret = toBase64(args.appHelper.appKeyPair.privateKey);
      const aliceIdentity = await opts.createIdentity(args.appId, appSecret, aliceId);
      const bobIdentity = await opts.createIdentity(args.appId, appSecret, bobId);

      args.versionBob = makeV2User({
        Tanker: opts.Tanker,
        adapter: opts.adapter,
        appId: args.appId,
        identity: bobIdentity,
        prefix: 'bob1',
      });
      args.versionAlice = makeV2User({
        Tanker: opts.Tanker,
        adapter: opts.adapter,
        appId: args.appId,
        identity: aliceIdentity,
        prefix: 'alice1',
      });
      args.currentBob = makeCurrentUser({
        appId: args.appId,
        identity: bobIdentity,
        prefix: 'bob2',
      });
      args.currentAlice = makeCurrentUser({
        appId: args.appId,
        identity: aliceIdentity,
        prefix: 'alice2',
      });

      await args.versionBob.start();
      await args.versionAlice.start();
      await args.currentBob.start();
      await args.currentAlice.start();
    });

    after(async () => {
      await args.versionBob.stop();
      await args.versionAlice.stop();
      await args.currentBob.stop();
      await args.currentAlice.stop();
      await args.appHelper.cleanup();
    });

    opts.tests.forEach(test => generatorMap[test](args));
  });
}

module.exports = {
  generateV1Tests,
  generateV2Tests,
};
