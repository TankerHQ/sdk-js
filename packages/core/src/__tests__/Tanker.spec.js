// @flow

import { tcrypto, utils, random, type b64string } from '@tanker/crypto';
import { InvalidArgument, PreconditionFailed } from '@tanker/errors';
import { createIdentity } from '@tanker/identity';

import { expect } from './chai';
import dataStoreConfig, { makePrefix } from './TestDataStore';

import { Tanker, optionsWithDefaults } from '..';

import { type EmailVerification, type RemoteVerification, statuses } from '../Session/types';
import { type SharingOptions } from '../DataProtection/options';

describe('Tanker', () => {
  let trustchainKeyPair;
  let appId;
  let userId;
  let badVerifications;

  const makeTestTankerOptions = () => ({
    appId: utils.toBase64(appId),
    socket: ({}: any),
    dataStore: { ...dataStoreConfig, prefix: makePrefix() },
    sdkType: 'test',
  });

  before(() => {
    trustchainKeyPair = tcrypto.makeSignKeyPair();
    appId = random(tcrypto.HASH_SIZE);
    userId = 'winnie';

    badVerifications = [
      undefined,
      null,
      'valid@email.com',
      [],
      {},
      { email: null, verificationCode: '12345678' },
      { email: ['valid@email.com'], verificationCode: '12345678' },
      { email: 'valid@email.com', verificationCode: '12345678', extra_invalid_key: 'test' },
      { passphrase: 12 },
      { passphrase: new Uint8Array(12) },
      { email: 'valid@email.com', verificationCode: '12345678', passphrase: 'valid_passphrase' }, // only one method at a time!
    ];
  });

  describe('version', () => {
    it('Tanker should have a static version attribute', () => {
      expect(typeof Tanker.version).to.equal('string');
    });
  });

  describe('optionsWithDefaults', () => {
    it('should accept default options', () => {
      const { adapter } = dataStoreConfig;
      const options = { appId: 'id' };
      const defaultOptions = { url: 'http://default.io', sdkType: 'default', dataStore: { adapter } };
      const mergedOptions = optionsWithDefaults(options, defaultOptions);
      expect(mergedOptions).to.deep.equal({
        appId: 'id', url: 'http://default.io', sdkType: 'default', dataStore: { adapter }
      });
    });

    it('should (deep) override default options', () => {
      const { adapter } = dataStoreConfig;

      const defaultPrefix = makePrefix();
      const defaultDatastore = { adapter, prefix: defaultPrefix };
      const defaultOptions = { appId: 'default', url: 'http://default.io', sdkType: 'default', dataStore: defaultDatastore };

      const newPrefix = makePrefix();
      const newOptions = { appId: 'new', url: 'http://new.io', dataStore: { adapter, prefix: newPrefix } };

      const expectedDatastore = { adapter, prefix: newPrefix };
      const expectedOptions = { appId: 'new', url: 'http://new.io', sdkType: 'default', dataStore: expectedDatastore };

      const mergedOptions = optionsWithDefaults(newOptions, defaultOptions);
      expect(mergedOptions).to.deep.equal(expectedOptions);
    });

    it('should throw when using optionsWithDefaults with bad arguments', () => {
      // $FlowExpectedError
      expect(() => optionsWithDefaults('not an object', { a: 1 })).to.throw(InvalidArgument);
      // $FlowExpectedError
      expect(() => optionsWithDefaults({ a: 1 }, 'not an object')).to.throw(InvalidArgument);
    });
  });

  describe('constructor', () => {
    it('throws when constructed with bad config arguments', () => {
      [
        // wrong types of options
        undefined,
        null,
        'paf',
        ['a', 'b'],
        // invalid appId
        {},
        { appId: undefined },
        { appId: new Uint8Array(32) },
        // missing dataStore
        { appId: 'ok' },
        // missing adapter
        { appId: 'ok', dataStore: {} },
        // wrong adapter type
        { appId: 'ok', dataStore: { adapter: 'not a function' } },
        { appId: 'ok', dataStore: { adapter: () => {} }, sdkType: undefined }
      ].forEach((invalidOptions, i) => {
        // $FlowExpectedError
        expect(() => { new Tanker(invalidOptions); }, `bad options #${i}`).to.throw(/options/); // eslint-disable-line no-new
      });
    });

    it('constructs a Tanker instance with default options', () => {
      expect(() => new Tanker(makeTestTankerOptions())).not.to.throw();
    });

    it('accepts the deprecated trustchainId option', () => {
      const { appId: trustchainId, ...defaultOptions } = makeTestTankerOptions();
      expect(() => new Tanker({ trustchainId, ...defaultOptions })).not.to.throw();
    });
  });

  describe('without a session', () => {
    let tanker;
    let options;

    beforeEach(async () => {
      options = makeTestTankerOptions();
      tanker = new Tanker(options);
    });

    it('get options', async () => {
      expect(tanker.options).to.deep.equal(options);
    });

    it('should throw when trying to get deviceId', async () => {
      expect(() => tanker.deviceId).to.throw(PreconditionFailed);
    });

    it('should throw when trying to get a resource id', async () => {
      const fakeResource = new Uint8Array(100);
      await expect(tanker.getResourceId(fakeResource)).to.be.rejectedWith(PreconditionFailed);
    });

    it('should throw when trying to get verification methods', async () => {
      await expect(tanker.getVerificationMethods()).to.be.rejectedWith(PreconditionFailed);
    });

    it('should throw when trying to make a stream encryptor or decryptor', async () => {
      await expect(tanker.makeDecryptorStream()).to.be.rejectedWith(PreconditionFailed);
      await expect(tanker.makeEncryptorStream()).to.be.rejectedWith(PreconditionFailed);
    });

    describe('start', () => {
      it('should throw when identity is undefined', async () => {
        // $FlowExpectedError
        await expect(tanker.start(undefined)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity is not base64', async () => {
        await expect(tanker.start('not b64')).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity\'s trustchain does not match tanker\'s', async () => {
        const otherAppKeyPair = tcrypto.makeSignKeyPair();
        const otherAppId = random(tcrypto.HASH_SIZE);
        const identity = await createIdentity(
          utils.toBase64(otherAppId),
          utils.toBase64(otherAppKeyPair.privateKey),
          userId,
        );
        await expect(tanker.start(identity)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity is valid but truncated', async () => {
        const identity = await createIdentity(
          utils.toBase64(appId),
          utils.toBase64(trustchainKeyPair.privateKey),
          userId,
        );
        const truncatedIdentity = identity.slice(0, identity.length - 10);
        await expect(tanker.start(truncatedIdentity)).to.be.rejectedWith(InvalidArgument);
      });
    });
  });

  describe('with a session', () => {
    let tanker;

    before(() => {
      tanker = new Tanker(makeTestTankerOptions());
    });

    beforeEach(() => {
      // mock a session
      tanker._session = ({ // eslint-disable-line no-underscore-dangle
        localUser: {},
        storage: { keyStore: { deviceId: new Uint8Array([]) } },
        status: statuses.READY,
      }: any);
    });

    describe('when identity registration is needed', () => {
      // $FlowExpectedError
      beforeEach(() => { tanker._session.status = statuses.IDENTITY_REGISTRATION_NEEDED; }); // eslint-disable-line no-underscore-dangle

      it('registering identity should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = ((badVerifications[i]: any): RemoteVerification);
          await expect(tanker.registerIdentity(arg), `register test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });

    describe('when identity verification is needed', () => {
      // $FlowExpectedError
      beforeEach(() => { tanker._session.status = statuses.IDENTITY_VERIFICATION_NEEDED; }); // eslint-disable-line no-underscore-dangle

      it('verifying identity should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = ((badVerifications[i]: any): RemoteVerification);
          await expect(tanker.verifyIdentity(arg), `verify identity test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });

    describe('which is ready', () => {
      it('setting verification method should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = ((badVerifications[i]: any): RemoteVerification);
          await expect(tanker.setVerificationMethod(arg), `set verification method test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('setting verification method should throw if generating verification key after registration', async () => {
        tanker._session.getVerificationMethods = async () => [{ type: 'passphrase' }]; // eslint-disable-line no-underscore-dangle

        await expect(tanker.generateVerificationKey()).to.be.rejectedWith(PreconditionFailed);
      });

      it('getting the device id should not throw', async () => {
        expect(() => tanker.deviceId).to.not.throw();
      });

      it('getting the resource id should throw if invalid argument given', async () => {
        const notResources = [undefined, null, 0, {}, [], 'str', new Uint8Array(10)];

        for (let i = 0; i < notResources.length; i++) {
          const arg = ((notResources[i]: any): Uint8Array);
          await expect(tanker.getResourceId(arg), `bad resource #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('revoking a device should throw if invalid argument given', async () => {
        const badArgs = [
          undefined,
          null,
          [],
          {},
        ];

        for (let i = 0; i < badArgs.length; i++) {
          const arg = ((badArgs[i]: any): b64string);
          await expect(tanker.revokeDevice(arg), `revoke test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('creating a group should throw if invalid argument given', async () => {
        const badArgs = [
          undefined,
          null,
          {},
          'random string'
        ];

        for (let i = 0; i < badArgs.length; i++) {
          const arg = ((badArgs[i]: any): Array<string>);
          await expect(tanker.createGroup(arg), `create group test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('updating group members should throw if invalid argument given', async () => {
        // $FlowExpectedError
        await expect(tanker.updateGroupMembers('', { usersToAdd: null })).to.be.rejectedWith(InvalidArgument);
        // $FlowExpectedError
        await expect(tanker.updateGroupMembers(null, { usersToAdd: ['user1'] })).to.be.rejectedWith(InvalidArgument);
      });

      it('sharing should throw if invalid argument given', async () => {
        const notShareWithValues = [
          null,
          0,
          'noArrayAroundMe',
          { shareWithUsers: [undefined] },
          { shareWithUsers: 'noArrayAroundMe' },
          { shareWithGroups: 'noArrayAroundMe' },
          { shareWithGroups: [new Uint8Array(32)] },
          {}, // empty is not allowed on reshare
        ];

        notShareWithValues.push(undefined);
        notShareWithValues.push([{ shareWithUsers: ['userId'] }]); // unexpected extra outer array

        for (let i = 0; i < notShareWithValues.length; i++) {
          const arg = ((notShareWithValues[i]: any): SharingOptions);
          await expect(tanker.share(['resourceId'], arg), `bad share option #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('verifying a provisional identity should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = ((badVerifications[i]: any): EmailVerification);
          await expect(tanker.verifyProvisionalIdentity(arg), `verify provisional identity test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });
  });
});
