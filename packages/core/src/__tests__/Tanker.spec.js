// @flow

import { tcrypto, utils, random } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';

import { expect } from './chai';
import dataStoreConfig, { makePrefix } from './TestDataStore';

import { Tanker, optionsWithDefaults } from '..';
import { InvalidArgument, InvalidIdentity, InvalidSessionStatus } from '../errors';

describe('Tanker', () => {
  let trustchainKeyPair;
  let trustchainId;
  let userId;

  before(() => {
    trustchainKeyPair = tcrypto.makeSignKeyPair();
    trustchainId = random(tcrypto.HASH_SIZE);
    userId = 'winnie';
  });

  describe('version', () => {
    it('Tanker should have a static version attribute', () => {
      expect(typeof Tanker.version).to.equal('string');
    });
  });

  describe('init', () => {
    it('constructor should throw with bad config argument', () => {
      [
        // wrong types of options
        undefined,
        null,
        'paf',
        ['a', 'b'],
        // invalid trustchainId
        {},
        { trustchainId: undefined },
        { trustchainId: new Uint8Array(32) },
        // missing dataStore
        { trustchainId: 'ok' },
        // missing adapter
        { trustchainId: 'ok', dataStore: {} },
        // wrong adapter type
        { trustchainId: 'ok', dataStore: { adapter: 'not a function' } },
        { trustchainId: 'ok', dataStore: { adapter: () => {} }, sdkType: undefined }
      ].forEach((invalidOptions, i) => {
        // $FlowExpectedError
        expect(() => { new Tanker(invalidOptions); }, `bad options #${i}`).to.throw(/options/); // eslint-disable-line no-new
      });

      expect(() => new Tanker({ trustchainId: 'ok', dataStore: { ...dataStoreConfig, prefix: makePrefix() }, sdkType: 'test' })).not.to.throw();
    });

    it('tanker options should accept defaults', () => {
      const { adapter } = dataStoreConfig;
      const options = { trustchainId: 'id' };
      const defaultOptions = { url: 'http://default.io', sdkType: 'default', dataStore: { adapter } };
      const mergedOptions = optionsWithDefaults(options, defaultOptions);
      expect(mergedOptions).to.deep.equal({
        trustchainId: 'id', url: 'http://default.io', sdkType: 'default', dataStore: { adapter }
      });
    });

    it('tanker options should (deep) override defaults', () => {
      const { adapter } = dataStoreConfig;

      const defaultPrefix = makePrefix();
      const defaultDatastore = { adapter, prefix: defaultPrefix };
      const defaultOptions = { trustchainId: 'default', url: 'http://default.io', sdkType: 'default', dataStore: defaultDatastore };

      const newPrefix = makePrefix();
      const newOptions = { trustchainId: 'new', url: 'http://new.io', dataStore: { adapter, prefix: newPrefix } };

      const expectedDatastore = { adapter, prefix: newPrefix };
      const expectedOptions = { trustchainId: 'new', url: 'http://new.io', sdkType: 'default', dataStore: expectedDatastore };

      const mergedOptions = optionsWithDefaults(newOptions, defaultOptions);
      expect(mergedOptions).to.deep.equal(expectedOptions);
    });

    it('should thow when using optionsWithDefaults with bad arguments', () => {
      // $FlowExpectedError
      expect(() => optionsWithDefaults('not an object', { a: 1 })).to.throw(InvalidArgument);
      // $FlowExpectedError
      expect(() => optionsWithDefaults({ a: 1 }, 'not an object')).to.throw(InvalidArgument);
    });
  });

  describe('closed session', () => {
    let tanker;
    let options;

    beforeEach(async () => {
      options = {
        trustchainId: utils.toBase64(trustchainId),
        socket: ({}: any),
        dataStore: { ...dataStoreConfig, prefix: makePrefix() },
        sdkType: 'test'
      };
      tanker = new Tanker(options);
    });

    describe('signUp', () => {
      it('should throw when identity is undefined', async () => {
        // $FlowExpectedError
        await expect(tanker.signUp(undefined)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity is not base64', async () => {
        await expect(tanker.signUp('not b64')).to.be.rejectedWith(InvalidIdentity);
      });

      it('should throw when identity\'s trustchain does not match tanker\'s', async () => {
        const otherTrustchainKeyPair = tcrypto.makeSignKeyPair();
        const otherTrustchainId = random(tcrypto.HASH_SIZE);
        const identity = await createIdentity(
          utils.toBase64(otherTrustchainId),
          utils.toBase64(otherTrustchainKeyPair.privateKey),
          userId,
        );
        await expect(tanker.signUp(identity)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity is valid but truncated', async () => {
        const identity = await createIdentity(
          utils.toBase64(trustchainId),
          utils.toBase64(trustchainKeyPair.privateKey),
          userId,
        );
        const truncatedIdentity = identity.slice(0, identity.length - 10);
        await expect(tanker.signUp(truncatedIdentity)).to.be.rejectedWith(InvalidIdentity);
      });

      it('should throw when trying to get deviceId', async () => {
        expect(() => tanker.deviceId).to.throw(InvalidSessionStatus);
      });
    });

    it('get options', async () => {
      expect(tanker.options).to.deep.equal(options);
    });

    it('should throw if EncryptionOptions is invalid', async () => {
      // $FlowExpectedError
      expect(() => tanker._parseEncryptionOptions('not an object')).to.throw(InvalidArgument); // eslint-disable-line no-underscore-dangle
    });
  });

  describe('opened session', () => {
    let tanker;

    before(() => {
      tanker = new Tanker({
        trustchainId: utils.toBase64(trustchainId),
        socket: {},
        dataStore: { ...dataStoreConfig, prefix: makePrefix() },
        sdkType: 'test'
      });
      // "open" a session
      tanker._session = ({ // eslint-disable-line no-underscore-dangle
        localUser: {},
        storage: { keyStore: { deviceId: new Uint8Array([]) } },
      }: any);
    });

    describe('unlock method registration', () => {
      const badArgs = [
        undefined,
        null,
        'valid@email.com',
        [],
        {},
        { email: null, password: false },
        { email: ['valid@email.com'] },
        { email: 'valid@email.com', not_a_valid_key: 'test' },
        { password: 12 },
        { password: new Uint8Array(12) },
        { email: 12, password: 'valid_password' },
        { email: 'valid@email.com', password: () => 'fun is not a password' },
      ];

      it('should throw if invalid argument given', async () => {
        for (let i = 0; i < badArgs.length; i++) {
          const arg = badArgs[i];
          // $FlowIKnow
          await expect(tanker.registerUnlock(arg), `register test n°${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('should get deviceId', async () => {
        expect(() => tanker.deviceId).to.not.throw();
      });

      it('should throw if revokeDevice has bad device ID', async () => {
        // $FlowExpectedError
        await expect(tanker.revokeDevice(null)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw if createGroup has bad users', async () => {
        // $FlowExpectedError
        await expect(tanker.createGroup(null)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw if updateGroupMembers has bad argments', async () => {
        // $FlowExpectedError
        await expect(tanker.updateGroupMembers('', { usersToAdd: null })).to.be.rejectedWith(InvalidArgument);
        // $FlowExpectedError
        await expect(tanker.updateGroupMembers(null, { usersToAdd: ['user1'] })).to.be.rejectedWith(InvalidArgument);
      });
    });

    describe('getResourceId', () => {
      const notUint8ArrayValues = [undefined, null, 0, {}, [], 'str'];

      it('should throw when given an invalid argument', async () => {
        Promise.all(notUint8ArrayValues.map(async (v, i) => {
          // $FlowExpectedError
          await expect(tanker.getResourceId(v), `bad resource #${i}`).to.be.rejectedWith(InvalidArgument);
        }));
      });
    });

    describe('sharing', () => {
      const notShareWithValues = [
        null,
        0,
        'noArrayAroundMe',
        { shareWithUsers: [undefined] },
        { shareWithUsers: 'noArrayAroundMe' },
        { shareWithGroups: 'noArrayAroundMe' },
        { shareWithGroups: [new Uint8Array(32)] },
      ];

      it('share() should throw when given an invalid option', async () => {
        notShareWithValues.push(undefined);
        notShareWithValues.push([{ shareWithUsers: ['userId'] }]); // unexpected extra outer array
        const resourceId = random(tcrypto.MAC_SIZE);

        for (let i = 0; i < notShareWithValues.length; i++) {
          const v = notShareWithValues[i];
          // $FlowExpectedError
          await expect(tanker.share([resourceId], v), `bad share option #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });

    describe('unlock methods', () => {
      it('should throw if hasRegisteredUnlockMethod asked for a wrong method', async () => {
        // $FlowExpectedError
        expect(() => tanker.hasRegisteredUnlockMethod('footRecognition')).to.throw(InvalidArgument);
      });
    });
  });
});
