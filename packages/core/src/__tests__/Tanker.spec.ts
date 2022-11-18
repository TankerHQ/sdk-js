import type { b64string } from '@tanker/crypto';
import { ready as cryptoReady, tcrypto, utils } from '@tanker/crypto';
import { InvalidArgument, PreconditionFailed } from '@tanker/errors';
import { createIdentity, getPublicIdentity, createProvisionalIdentity } from '@tanker/identity';
import { expect, isBrowser } from '@tanker/test-utils';
import { castData } from '@tanker/types';

import dataStoreConfig, { makePrefix } from './TestDataStore';

import { Tanker, optionsWithDefaults } from '..';
import { EncryptionSession } from '../DataProtection/EncryptionSession';
import type { TankerCoreOptions } from '../Tanker';
import type { EmailVerification, RemoteVerification, PreverifiedVerification } from '../LocalUser/types';
import type { SharingOptions } from '../DataProtection/options';

describe('Tanker', () => {
  let trustchainKeyPair: tcrypto.SodiumKeyPair;
  let appId: Uint8Array;
  let userId: b64string;
  let statuses: typeof Tanker.statuses;

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

  const validPreverifiedVerifications = [
    { preverifiedEmail: 'valid@tanker.io' },
    { preverifiedPhoneNumber: '+33639986789' },
  ];
  const badPreverifiedVerifications = [
    undefined,
    null,
    'valid@tanker.io',
    [],
    {},
    { preverifiedEmail: 'valid@tanker.io' },
    { preverifiedPhoneNumber: '+33639986789' },
    [{ preverifiedEmail: 'valid@tanker.io', passphrase: 'valid_passphrase' }],
    [{ preverifiedEmail: 'valid@tanker.io' }, { passphrase: 'valid_passphrase' }],
    [{ preverifiedEmail: 'valid@tanker.io' }, { preverifiedEmail: 'valid@tanker.io' }],
    [{ preverifiedEmail: 'valid@tanker.io' }, { preverifiedEmail: 'valid2@tanker.io' }],
    [{ preverifiedPhoneNumber: '+33639986789', passphrase: 'valid_passphrase' }],
    [{ preverifiedPhoneNumber: '+33639986789' }, { passphrase: 'valid_passphrase' }],
    [{ preverifiedPhoneNumber: '+33639986789' }, { preverifiedPhoneNumber: '+33639986789' }],
    [{ preverifiedPhoneNumber: '+33639986789' }, { preverifiedPhoneNumber: '+33639986780' }],
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
        appId: 'id', url: 'http://default.io', sdkType: 'default', dataStore: { adapter },
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
      // @ts-expect-error
      expect(() => optionsWithDefaults('not an object', { a: 1 })).to.throw(InvalidArgument);
      // @ts-expect-error
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
        { appId: valid32BytesB64, dataStore: { adapter: () => { } }, sdkType: undefined },
      ].forEach((invalidOptions: any, i: number) => {
        expect(() => { new Tanker(invalidOptions); }, `bad options #${i}`).to.throw(/options/); // eslint-disable-line no-new
      });
    });

    it('constructs a Tanker instance with default options', () => {
      expect(() => new Tanker(makeTestTankerOptions())).not.to.throw();
    });
  });

  describe('without a session', () => {
    const badIdentities = [
      undefined,
      null,
      {},
      [],
      '',
      'not base 64',
    ];

    let tanker: Tanker;
    let options: TankerCoreOptions;
    let identity: b64string;

    beforeEach(async () => {
      identity = await createIdentity(
        utils.toBase64(appId),
        utils.toBase64(trustchainKeyPair.privateKey),
        userId,
      );
    });

    beforeEach(async () => {
      options = makeTestTankerOptions();
      tanker = new Tanker(options);
    });

    it('get options', async () => {
      expect(tanker.options).to.deep.equal(options);
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
        for (let i = 0; i < badIdentities.length; i++) {
          const arg = badIdentities[i] as string;
          await expect(tanker.start(arg)).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('should throw when identity\'s trustchain does not match tanker\'s', async () => {
        const otherAppKeyPair = tcrypto.makeSignKeyPair();
        const otherAppId = utils.generateAppID(otherAppKeyPair.publicKey);
        const wrongIdentity = await createIdentity(
          utils.toBase64(otherAppId),
          utils.toBase64(otherAppKeyPair.privateKey),
          userId,
        );
        await expect(tanker.start(wrongIdentity)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity is valid but truncated', async () => {
        const truncatedIdentity = identity.slice(0, identity.length - 10);
        await expect(tanker.start(truncatedIdentity)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity is public instead of secret', async () => {
        const publicIdentity = await getPublicIdentity(identity);
        await expect(tanker.start(publicIdentity)).to.be.rejectedWith(InvalidArgument, 'Expected a secret permanent identity, but got a public permanent identity');
      });
    });

    describe('enrollUser', () => {
      it('throws when tanker is not STOPPED', async () => {
        const illegalStatuses = [
          statuses.READY,
          statuses.IDENTITY_REGISTRATION_NEEDED,
          statuses.IDENTITY_VERIFICATION_NEEDED,
        ];

        for (const status of illegalStatuses) {
          // mock active session
          tanker._session = { // eslint-disable-line no-underscore-dangle
            status,
          } as any;
          await expect(tanker.enrollUser(identity, validPreverifiedVerifications)).to.be.rejectedWith(PreconditionFailed);
        }
      });

      it('throws when identity is invalid', async () => {
        for (let i = 0; i < badIdentities.length; i++) {
          const arg = badIdentities[i] as string;
          await expect(tanker.enrollUser(arg, validPreverifiedVerifications)).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('throws when identity\'s trustchain does not match tanker\'s', async () => {
        const otherAppKeyPair = tcrypto.makeSignKeyPair();
        const otherAppId = utils.generateAppID(otherAppKeyPair.publicKey);
        const wrongIdentity = await createIdentity(
          utils.toBase64(otherAppId),
          utils.toBase64(otherAppKeyPair.privateKey),
          userId,
        );

        await expect(tanker.enrollUser(wrongIdentity, validPreverifiedVerifications)).to.be.rejectedWith(InvalidArgument);
      });

      it('throws when identity is valid but truncated', async () => {
        const truncatedIdentity = identity.slice(0, identity.length - 10);
        await expect(tanker.enrollUser(truncatedIdentity, validPreverifiedVerifications)).to.be.rejectedWith(InvalidArgument);
      });

      it('throws when identity is public instead of secret', async () => {
        const publicIdentity = await getPublicIdentity(identity);
        await expect(tanker.enrollUser(publicIdentity, validPreverifiedVerifications)).to.be.rejectedWith(InvalidArgument, 'Expected a secret permanent identity');
      });

      it('throws when identity is provisional instead of secret', async () => {
        const provIdentity = await createProvisionalIdentity(options.appId!, 'email', 'valid@tanker.io');
        await expect(tanker.enrollUser(provIdentity, validPreverifiedVerifications)).to.be.rejectedWith(InvalidArgument, 'Expected a secret permanent identity');
      });

      it('throws when verifications are invalid', async () => {
        for (let i = 0; i < badPreverifiedVerifications.length; i++) {
          const arg = badPreverifiedVerifications[i] as Array<PreverifiedVerification>;
          await expect(tanker.enrollUser(identity, arg), `enroll User test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });
  });

  describe('with a session', () => {
    let tanker: Tanker;
    let options: TankerCoreOptions;

    before(() => {
      options = makeTestTankerOptions();
      tanker = new Tanker(options);
    });

    beforeEach(() => {
      // mock a session
      tanker._session = ({ // eslint-disable-line no-underscore-dangle
        status: statuses.READY,
      } as any);
    });

    describe('when identity registration is needed', () => {
      beforeEach(() => { tanker._session!.status = statuses.IDENTITY_REGISTRATION_NEEDED; }); // eslint-disable-line no-underscore-dangle

      it('registering identity should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = badVerifications[i] as RemoteVerification;
          await expect(tanker.registerIdentity(arg), `register test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });

    describe('when identity verification is needed', () => {
      beforeEach(() => { tanker._session!.status = statuses.IDENTITY_VERIFICATION_NEEDED; }); // eslint-disable-line no-underscore-dangle

      it('verifying identity should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = badVerifications[i] as RemoteVerification;
          await expect(tanker.verifyIdentity(arg), `verify identity test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });

    describe('which is ready', () => {
      it('setting verification method should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = badVerifications[i] as RemoteVerification;
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
          const arg = notResources[i] as Uint8Array;
          await expect(tanker.getResourceId(arg), `bad resource #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('creating a group should throw if invalid argument given', async () => {
        const badArgs = [
          undefined,
          null,
          {},
          'random string',
        ];

        for (let i = 0; i < badArgs.length; i++) {
          const arg = badArgs[i] as Array<string>;
          await expect(tanker.createGroup(arg), `create group test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('updating group members should throw if invalid GroupID argument given', async () => {
        const badGroupIdArgs = [
          undefined,
          null,
          {},
          '',
          'oopsy!',
          'AAAA=',
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
        ];

        for (let i = 0; i < badGroupIdArgs.length; i++) {
          const badGroupIdArg = badGroupIdArgs[i] as string;
          await expect(tanker.updateGroupMembers(badGroupIdArg, { usersToAdd: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='] })).to.be.rejectedWith(InvalidArgument, 'groupId');
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
          const badUsersArg = badUsersArgs[i] as { usersToAdd?: Array<string>; usersToRemove?: Array<string>; };
          await expect(tanker.updateGroupMembers(validGroupId, badUsersArg)).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('sharing should throw if invalid options argument given', async () => {
        const notShareWithValues = [
          undefined,
          null,
          0,
          'noArrayAroundMe',
          { shareWithUsers: [undefined] },
          { shareWithUsers: [''] },
          { shareWithUsers: 'noArrayAroundMe' },
          { shareWithGroups: 'noArrayAroundMe' },
          { shareWithUsers: [''] },
          { shareWithGroups: [new Uint8Array(32)] },
          { shareWithGroups: ['oopsy!'] },
          { shareWithGroups: ['AAAA='] },
          { shareWithGroups: ['AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='] },
          {}, // empty is not allowed on reshare
          [{ shareWithUsers: ['userId'] }], // unexpected extra outer array
          { paddingStep: -1 },
          { paddingStep: 0 },
          { paddingStep: 1 },
          { paddingStep: 2.42 },
          { paddingStep: 'a random string' },
          { paddingStep: null },
        ];

        const resourceId = utils.toBase64(new Uint8Array(16));

        for (let i = 0; i < notShareWithValues.length; i++) {
          const arg = notShareWithValues[i] as SharingOptions;
          await expect(tanker.share([resourceId], arg), `bad share option #${i}`).to.be.rejectedWith(InvalidArgument, 'options');
        }
      });

      it('sharing should throw if invalid resourceId argument given', async () => {
        await expect(tanker.share(['resourceId'], { shareWithUsers: ['userId'] })).to.be.rejectedWith(InvalidArgument);
      });

      it('attaching a public provisional identity throws', async () => {
        const privProvIdentity = await createProvisionalIdentity(options.appId!, 'email', 'valid@tanker.io');
        const pubProvIdentity = await getPublicIdentity(privProvIdentity);
        await expect(tanker.attachProvisionalIdentity(pubProvIdentity)).to.be.rejectedWith(InvalidArgument, 'private provisional identity');
      });

      it('verifying a provisional identity should throw if invalid argument given', async () => {
        for (let i = 0; i < badVerifications.length; i++) {
          const arg = badVerifications[i] as EmailVerification;
          await expect(tanker.verifyProvisionalIdentity(arg), `verify provisional identity test #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });

    describe('API typing', () => {
      // All the following tests are checking that TypeScript correctly deduces types returned by Tanker APIs
      // The runtime does not matter. If a test successfully compiles, it is considered valid.
      beforeEach(() => {
        // mock a session
        tanker._session = ({ // eslint-disable-line no-underscore-dangle
          status: statuses.READY,
          encryptData: (arg: any) => arg,
          decryptData: (arg: any) => arg,
          download: () => '',
        } as any);
      });

      describe('encryptData/decryptData\'s return type', () => {
        let array: Uint8Array;

        before(async () => {
          array = utils.fromString(' ');
        });

        if (isBrowser()) {
          let blob: Blob;
          let file: File;

          before(async () => {
            blob = await castData(array, { type: Blob });
            file = await castData(array, { type: File });
          });

          it('is deduced from input data type', async () => {
            const encryptedBlob = await tanker.encryptData(file);
            const encryptedFile = await tanker.encryptData(blob);

            const decryptedBlob = await tanker.decryptData(blob);
            const decryptedFile = await tanker.decryptData(file);

            blob = encryptedFile;
            file = encryptedBlob;

            blob = decryptedBlob;
            file = decryptedFile;
          });

          it('is overriden by FormatOptions', async () => {
            const encryptedFromArray = await tanker.encryptData(array, { type: File });
            const decryptedFromArray = await tanker.decryptData(array, { type: File });

            file = encryptedFromArray;
            file = decryptedFromArray;
          });
        } else {
          let buffer: Buffer;

          before(async () => {
            buffer = await castData(array, { type: Buffer });
          });

          it('is deduced from input data type', async () => {
            const encryptedBuffer = await tanker.encryptData(buffer);
            const encryptedArray = await tanker.encryptData(array);

            const decryptedBuffer = await tanker.decryptData(buffer);
            const decryptedArray = await tanker.decryptData(array);

            buffer = encryptedBuffer;
            array = encryptedArray;
            buffer = decryptedBuffer;
            array = decryptedArray;
          });

          it('is overriden by FormatOptions', async () => {
            const encryptedArray = await tanker.encryptData(array, { type: Buffer });
            const decryptedArray = await tanker.decryptData(array, { type: Buffer });

            buffer = encryptedArray;
            buffer = decryptedArray;
          });
        }
      });

      /* eslint-disable @typescript-eslint/no-unused-vars */
      describe('encrypt\'s return type', () => {
        // @ts-expect-error only used as destination
        let array: Uint8Array;

        if (isBrowser()) {
          // @ts-expect-error only used as destination
          let file: File;

          before(async () => {
            file = await castData(utils.fromString(' '), { type: File });
            array = utils.fromString(' ');
          });

          it('is Uint8Array by default', async () => {
            const encryptedArray = await tanker.encrypt(' ');

            // Use the compiler to check that assignation is possible (type deducted correctly)
            array = encryptedArray;
          });

          it('is overriden by FormatOptions', async () => {
            const encryptedBuffer = await tanker.encrypt(' ', { type: File });

            // Use the compiler to check that assignation is possible (type deducted correctly)
            file = encryptedBuffer;
          });
        } else {
          // @ts-expect-error only used as destination
          let buffer: Buffer;

          before(async () => {
            buffer = await castData(utils.fromString(' '), { type: Buffer });
            array = utils.fromString(' ');
          });

          it('is Uint8Array by default', async () => {
            const encryptedArray = await tanker.encrypt(' ');

            // Use the compiler to check that assignation is possible (type deducted correctly)
            array = encryptedArray;
          });

          it('is overriden by FormatOptions', async () => {
            const encryptedBuffer = await tanker.encrypt(' ', { type: Buffer });

            // Use the compiler to check that assignation is possible (type deducted correctly)
            buffer = encryptedBuffer;
          });
        }
      });

      describe('download\'s return type', () => {
        const resourceID = 'AAAAAAAAAAAAAAAAAAAAAA==';

        if (isBrowser()) {
          // @ts-expect-error only used as destination
          let fileOrArray: globalThis.File | Uint8Array;
          // @ts-expect-error only used as destination
          let blob: Blob;

          it('is File | Uint8Array by default', async () => {
            const downloadedResource = await tanker.download(resourceID);
            fileOrArray = downloadedResource;
          });

          it('is overriden by FormatOptions', async () => {
            const downloadedBlob = await tanker.download(resourceID, { type: Blob });
            blob = downloadedBlob;
          });
        } else {
          // @ts-expect-error only used as destination
          let fileOrArray: globalThis.File | Uint8Array;
          // @ts-expect-error only used as destination
          let buffer: Buffer;

          it('is File | Uint8Array by default', async () => {
            const downloadedResource = await tanker.download(resourceID);
            fileOrArray = downloadedResource;
          });

          it('is overriden by FormatOptions', async () => {
            const downloadedBuffer = await tanker.download(resourceID, { type: Buffer });
            buffer = downloadedBuffer;
          });
        }
      });
      /* eslint-enable @typescript-eslint/no-unused-vars */

      describe('encryptionSession', () => {
        let array: Uint8Array;
        let session: EncryptionSession;

        before(async () => {
          array = utils.fromString(' ');
          // @ts-expect-error we hijack the calls anyway
          session = new EncryptionSession(undefined, undefined);
          session.encryptData = (arg: any) => arg;
        });

        if (isBrowser()) {
          let blob: Blob;
          let file: File;

          before(async () => {
            blob = await castData(array, { type: Blob });
            file = await castData(array, { type: File });
          });

          describe('encryptData\'s return type', () => {
            it('is deduced from input data type', async () => {
              const encryptedBlob = await session.encryptData(file);
              const encryptedFile = await session.encryptData(blob);
              const encryptedArray = await session.encryptData(array);

              blob = encryptedFile;
              file = encryptedBlob;
              array = encryptedArray;
            });

            it('is overriden by FormatOptions', async () => {
              const encryptedArray = await session.encryptData(blob, { type: Blob });
              const encryptedFromArray = await session.encryptData(array, { type: File });

              blob = encryptedArray;
              file = encryptedFromArray;
            });
          });

          describe('encryptionSession.encrypt\'s return type', () => {
            it('is Uint8Array by default', async () => {
              const encryptedArray = await session.encrypt(' ');

              // Use the compiler to check that assignation is possible (type deducted correctly)
              array = encryptedArray;
            });

            it('is overriden by FormatOptions', async () => {
              const encryptedBlob = await session.encrypt(' ', { type: Blob });

              // Use the compiler to check that assignation is possible (type deducted correctly)
              blob = encryptedBlob;
            });
          });
        } else {
          let buffer: Buffer;

          before(async () => {
            buffer = await castData(array, { type: Buffer });
          });

          describe('encryptData\'s return type', () => {
            it('is deduced from input data type', async () => {
              const encryptedBuffer = await session.encryptData(buffer);
              const encryptedArray = await session.encryptData(array);

              buffer = encryptedBuffer;
              array = encryptedArray;
            });

            it('is overriden by FormatOptions', async () => {
              const encryptedBuffer = await session.encryptData(buffer, { type: Buffer });

              buffer = encryptedBuffer;
            });
          });

          describe('encryptionSession.encrypt\'s return type', () => {
            it('is Uint8Array by default', async () => {
              const encryptedArray = await session.encrypt(' ');

              // Use the compiler to check that assignation is possible (type deducted correctly)
              array = encryptedArray;
            });

            it('is overriden by FormatOptions', async () => {
              const encryptedBuffer = await session.encrypt(' ', { type: Buffer });

              // Use the compiler to check that assignation is possible (type deducted correctly)
              buffer = encryptedBuffer;
            });
          });
        }
      });
    });
  });
});
