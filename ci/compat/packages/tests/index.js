// @flow
import { expect, uuid } from '../../../../packages/test-utils';

import { AppHelper, makeCurrentUser, makeV2User, toBase64 } from './helpers';

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

function generateDeviceVersionUpgradeTest(args) {
  it(`creates a device with ${args.version} and upgrades the device with current code`, async () => {
    const baseConfig = {
      adapter: args.adapter,
      appId: args.appId,
      identity: args.currentBob.identity,
      prefix: 'phone',
    };

    const phone = makeV2User({ ...baseConfig, Tanker: args.Tanker });

    await phone.start();
    const message = 'Message for myself';
    const encryptedData = await phone.encrypt(message, [], []);
    await phone.stop();

    // We're reusing the same adapter and prefix so that the underlying datastore is reused
    const phoneUpgraded = makeCurrentUser(baseConfig);

    // Test the device is started (and migrated if needed) - not recreated
    const status = await phoneUpgraded._tanker.start(phoneUpgraded._identity); // eslint-disable-line no-underscore-dangle
    expect(status).to.equal(phoneUpgraded._tanker.constructor.statuses.READY); // eslint-disable-line no-underscore-dangle

    // Still able to decrypt message with local key
    phoneUpgraded._tanker.session._client.getResourceKey = () => { // eslint-disable-line no-underscore-dangle
      throw new Error('Unexpected call of client.getResourceKey() in compat test');
    };
    const decrypted = await phoneUpgraded.decrypt(encryptedData);
    expect(decrypted).to.equal(message);

    await phoneUpgraded.stop();
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
    await expect(phone.encrypt('message', [], [])).to.be.rejected;
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

function generateEncryptionSessionTests(args) {
  it(`encrypts in ${args.version} with an encryption session and decrypts with current code`, async () => {
    const message = 'secret message';
    const encryptionSession = await args.versionAlice.createEncryptionSession([await args.versionBob.id], []);
    const encryptedData = toBase64(await encryptionSession.encrypt(message));

    let decryptedData = await args.currentBob.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);

    decryptedData = await args.currentAlice.decrypt(encryptedData);
    expect(decryptedData).to.equal(message);
  });
}

const generatorMap = {
  deviceUpgrade: generateDeviceVersionUpgradeTest,
  encryption: generateEncryptTest,
  encryptionSession: generateEncryptionSessionTests,
  filekit: generateFilekitTest,
  group: generateGroupTest,
  revocationV2: generateRevocationV2Test,
};

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
  generateV2Tests,
};
