// @flow

import { ready as cryptoReady, tcrypto, utils, type b64string } from '@tanker/crypto';
import { InvalidArgument, PreconditionFailed } from '@tanker/errors';
import { createIdentity, getPublicIdentity } from '@tanker/identity';
import { expect, silencer } from '@tanker/test-utils';

import dataStoreConfig, { makePrefix } from './TestDataStore';

import { Tanker, optionsWithDefaults } from '..';

import { type TankerCoreOptions } from '../Tanker';
import { type EmailVerification, type RemoteVerification } from '../LocalUser/types';
import { type SharingOptions } from '../DataProtection/options';

describe('Tanker', () => {
  let trustchainKeyPair;
  let appId;
  let userId;
  let statuses;

  const makeTestTankerOptions = () => ({
    appId: utils.toBase64(appId),
    dataStore: { ...dataStoreConfig, prefix: makePrefix() },
    sdkType: 'sdk-js-test',
  });

  const valid32BytesB64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

  const badVerifications = [
    undefined,
    null,
    'valid@tanker.io',
    [],
    {},
    { email: null, verificationCode: '12345678' },
    { email: '', verificationCode: '12345678' },
    { email: ['valid@tanker.io'], verificationCode: '12345678' },
    { email: 'valid@tanker.io', verificationCode: '' },
    { email: 'valid@tanker.io', verificationCode: '12345678', extra_invalid_key: 'test' },
    { passphrase: 12 },
    { passphrase: new Uint8Array(12) },
    { passphrase: '' },
    { email: 'valid@tanker.io', verificationCode: '12345678', passphrase: 'valid_passphrase' }, // only one method at a time!
  ];

  before(async () => {
    await cryptoReady;
    trustchainKeyPair = tcrypto.makeSignKeyPair();
    appId = utils.generateAppID(trustchainKeyPair.publicKey);

    ({ statuses } = Tanker);

    userId = 'winnie';
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
        { appId: '' },
        { appId: 'AAAA=' },
        { appId: new Uint8Array(32) },
        // missing dataStore
        { appId: valid32BytesB64 },
        // missing adapter
        { appId: valid32BytesB64, dataStore: {} },
        // wrong adapter type
        { appId: valid32BytesB64, dataStore: { adapter: 'not a function' } },
        { appId: valid32BytesB64, dataStore: { adapter: () => {} }, sdkType: undefined }
      ].forEach((invalidOptions, i) => {
        const arg = ((invalidOptions: any): TankerCoreOptions);
        expect(() => { new Tanker(arg); }, `bad options #${i}`).to.throw(/options/); // eslint-disable-line no-new
      });
    });

    it('constructs a Tanker instance with default options', () => {
      expect(() => new Tanker(makeTestTankerOptions())).not.to.throw();
    });

    it('accepts the deprecated trustchainId option', silencer.wrapper('warn', /deprecated/)(() => {
      const { appId: trustchainId, ...defaultOptions } = makeTestTankerOptions();
      expect(() => new Tanker({ trustchainId, ...defaultOptions })).not.to.throw();
    }));
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

    it('should throw when trying to get verification methods', async () => {
      await expect(tanker.getVerificationMethods()).to.be.rejectedWith(PreconditionFailed);
    });

    it('should throw when trying to create an encryption or decryption stream', async () => {
      await expect(tanker.createDecryptionStream()).to.be.rejectedWith(PreconditionFailed);
      await expect(tanker.createEncryptionStream()).to.be.rejectedWith(PreconditionFailed);
    });

    describe('start', () => {
      it('should throw when identity is invalid', async () => {
        const badIdentities = [
          undefined,
          null,
          {},
          [],
          '',
          'not base 64'
        ];

        for (let i = 0; i < badIdentities.length; i++) {
          const arg = ((badIdentities[i]: any): string);
          await expect(tanker.start(arg)).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('should throw when identity\'s trustchain does not match tanker\'s', async () => {
        const otherAppKeyPair = tcrypto.makeSignKeyPair();
        const otherAppId = utils.generateAppID(otherAppKeyPair.publicKey);
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

      it('should throw when identity is public instead of secret', async () => {
        const identity = await createIdentity(
          utils.toBase64(appId),
          utils.toBase64(trustchainKeyPair.privateKey),
          userId,
        );
        const publicIdentity = await getPublicIdentity(identity);
        await expect(tanker.start(publicIdentity)).to.be.rejectedWith(InvalidArgument, 'Expected a secret permanent identity, but got a public permanent identity');
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
        tanker.session.getVerificationMethods = async () => [{ type: 'passphrase' }]; // eslint-disable-line no-underscore-dangle

        await expect(tanker.generateVerificationKey()).to.be.rejectedWith(PreconditionFailed);
      });

      it('getting the resource id should throw if invalid argument given', async () => {
        const notResources = [undefined, null, 0, {}, [], 'str', new Uint8Array(10)];

        for (let i = 0; i < notResources.length; i++) {
          const arg = ((notResources[i]: any): Uint8Array);
          await expect(tanker.getResourceId(arg), `bad resource #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('revoking a device should throw if invalid argument given', silencer.wrapper('warn', /deprecated/)(async () => {
        const badArgs = [
          undefined,
          null,
          [],
          {},
          '',
          'not base 64',
          'AAAA='
        ];

        for (let i = 0; i < badArgs.length; i++) {
          const arg = ((badArgs[i]: any): b64string);
          await expect(tanker.revokeDevice(arg), `revoke test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      }));

      it('creating a group should throw if invalid argument given', async () => {
        const badArgs = [
          undefined,
          null,
          {},
          'random string',
        ];

        for (let i = 0; i < badArgs.length; i++) {
          const arg = ((badArgs[i]: any): Array<string>);
          await expect(tanker.createGroup(arg), `create group test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('updating group members should throw if invalid GroupID argument given', async () => {
        const badGroupIdArgs = [
          undefined,
          null,
          {},
          ''
        ];

        for (let i = 0; i < badGroupIdArgs.length; i++) {
          const badGroupIdArg = ((badGroupIdArgs[i]: any): string);
          await expect(tanker.updateGroupMembers(badGroupIdArg, { usersToAdd: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='] })).to.be.rejectedWith(InvalidArgument);
        }
      });

      const validGroupId = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

      it('updating group members should throw if invalid Users argument given', async () => {
        const badUsersArgs = [
          undefined,
          null,
          {},
          'random string',
          { usersToAdd: null, usersToRemove: null },
          { usersToAdd: [], usersToRemove: [] },
          { usersToAdd: [''] },
          { usersToRemove: [''] },
        ];
        for (let i = 0; i < badUsersArgs.length; i++) {
          const badUsersArg = ((badUsersArgs[i]: any): $Exact<{ usersToAdd?: Array<string>, usersToRemove?: Array<string> }>);
          await expect(tanker.updateGroupMembers(validGroupId, badUsersArg)).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('sharing should throw if invalid argument given', async () => {
        const notShareWithValues = [
          null,
          0,
          'noArrayAroundMe',
          { shareWithUsers: [undefined] },
          { shareWithUsers: [''] },
          { shareWithUsers: 'noArrayAroundMe' },
          { shareWithGroups: 'noArrayAroundMe' },
          { shareWithUsers: [''] },
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
