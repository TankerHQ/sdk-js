// @flow

import { tcrypto, utils, random } from '@tanker/crypto';
import { createIdentity } from '@tanker/identity';

import { expect } from './chai';
import dataStoreConfig, { makePrefix } from './TestDataStore';

import { Tanker, optionsWithDefaults } from '..';
import { InvalidArgument, InvalidIdentity } from '../errors';

describe('Tanker', () => {
  let trustchainKeyPair;
  let trustchainId;
  let userId;

  before(() => {
    trustchainKeyPair = tcrypto.makeSignKeyPair();
    trustchainId = random(tcrypto.HASH_SIZE);
    userId = 'winnie';
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
      ].forEach((invalidOptions, i) => {
        // $FlowExpectedError
        expect(() => { new Tanker(invalidOptions); }, `bad options #${i}`).to.throw(/options/); // eslint-disable-line no-new
      });

      expect(() => new Tanker({ trustchainId: 'ok', dataStore: { ...dataStoreConfig, prefix: makePrefix() }, sdkType: 'test' })).not.to.throw();
    });

    it('tanker options should accept defaults', () => {
      const options = { trustchainId: 'id' };
      const defaultOptions = { url: 'http://default.io', sdkType: 'default' };
      const mergedOptions = optionsWithDefaults(options, defaultOptions);
      expect(mergedOptions).to.deep.equal({ trustchainId: 'id', url: 'http://default.io', sdkType: 'default' });
    });

    it('tanker options should (deep) override defaults', () => {
      const defaultAdapter = () => {};
      const defaultPrefix = makePrefix();
      const defaultDatastore = { adapter: defaultAdapter, prefix: defaultPrefix };
      const defaultOptions = { trustchainId: 'default', url: 'http://default.io', dataStore: defaultDatastore };

      const newAdapter = () => {};
      const newOptions = { trustchainId: 'new', url: 'http://new.io', dataStore: { adapter: newAdapter } };

      const expectedDatastore = { adapter: newAdapter, prefix: defaultPrefix };
      const expectedOptions = { trustchainId: 'new', url: 'http://new.io', dataStore: expectedDatastore };

      const mergedOptions = optionsWithDefaults(newOptions, defaultOptions);
      expect(mergedOptions).to.deep.equal(expectedOptions);
    });
  });

  describe('closed session', () => {
    let tanker;

    beforeEach(async () => {
      tanker = new Tanker({
        trustchainId: utils.toBase64(trustchainId),
        socket: ({}: any),
        dataStore: { ...dataStoreConfig, prefix: makePrefix() },
        sdkType: 'test'
      });
    });

    describe('signUp', () => {
      it('should throw when identity is undefined', async () => {
        // $FlowExpectedError
        await expect(tanker.signUp(undefined)).to.be.rejectedWith(InvalidArgument);
      });

      it('should throw when identity is not base64', async () => {
        await expect(tanker.signUp('not b64')).to.be.rejectedWith(InvalidIdentity);
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
      tanker._session = ({ localUser: {} }: any); // eslint-disable-line no-underscore-dangle
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
  });
});
