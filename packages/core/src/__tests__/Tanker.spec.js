// @flow

import { tcrypto, utils, random, obfuscateUserId } from '@tanker/crypto';

import { expect } from './chai';
import dataStoreConfig, { makePrefix } from './TestDataStore';
import { warnings } from './WarningsRemover';

import { Tanker, TankerStatus, getResourceId, optionsWithDefaults } from '..';
import { createUserTokenFromSecret } from './TestSessionTokens';
import { InvalidArgument, InvalidUserToken, InvalidSessionStatus } from '../errors';
import { DEVICE_TYPE } from '../Unlock/unlock';

describe('Tanker', () => {
  const trustchainKeyPair = tcrypto.makeSignKeyPair();
  const trustchainId = random(tcrypto.HASH_SIZE);

  const userId = 'winnie';
  const obfuscatedUserId = obfuscateUserId(trustchainId, userId);
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

    it('instance should have numeric status constants matching TankerStatus', () => {
      const statuses = ['CLOSED', 'CLOSING', 'UNLOCK_REQUIRED', 'OPEN', 'OPENING', 'USER_CREATION'];
      const dataStore = { ...dataStoreConfig, prefix: makePrefix() };
      const tanker = new Tanker({ trustchainId: 'nevermind', dataStore, sdkType: 'test' });

      for (const status of statuses) {
        // $FlowIKnow
        expect(typeof tanker[status]).to.equal('number');
        // $FlowIKnow
        expect(tanker[status]).to.equal(TankerStatus[status]);
      }
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

    it('should not allow to accept a device', async () => {
      await expect(tanker.acceptDevice('V1d0ak5XTXdlRVJSYmxacFRURktkbGxXWXpGaWEyeElZVWQ0YW1KV1ZUaz0=')).to.be.rejectedWith(InvalidSessionStatus);
    });

    describe('open', () => {
      it('should throw when token is not base64', async () => {
        await expect(tanker.open(userId, 'not b64')).to.be.rejected;
      });

      it('should throw when token is null', async () => {
        // $FlowExpectedError
        await expect(tanker.open(userId, null)).to.be.rejected;
      });

      it('should throw when secret is empty', async () => {
        const badSecret = '';
        const userToken = createUserTokenFromSecret(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
        const promise = tanker.open(userId, userToken);
        await expect(promise).to.be.rejectedWith(InvalidUserToken);
      });

      it('should throw when secret is the wrong size', async () => {
        const badSecret = utils.toBase64(random(tcrypto.USER_SECRET_SIZE - 1));
        const userToken = createUserTokenFromSecret(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
        const promise = tanker.open(userId, userToken);
        await expect(promise).to.be.rejectedWith(InvalidUserToken);
      });

      it('should throw when secret is not the user\'s secret', async () => {
        const badSecret = utils.toBase64(random(tcrypto.USER_SECRET_SIZE));
        const userToken = createUserTokenFromSecret(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
        const promise = tanker.open(userId, userToken);
        await expect(promise).to.be.rejectedWith(InvalidUserToken);
      });
    });
  });

  describe('opened session', () => {
    const tanker = new Tanker({
      trustchainId: utils.toBase64(trustchainId),
      socket: {},
      dataStore: { ...dataStoreConfig, prefix: makePrefix() },
      sdkType: 'test'
    });
    // "open" a session
    tanker._session = ({ localUser: { deviceType: DEVICE_TYPE.client_device } }: any); // eslint-disable-line no-underscore-dangle

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

      describe('deprecated methods', () => {
        before(() => warnings.silence(/deprecated/));
        after(() => warnings.restore());

        it('should throw if invalid argument given to deprecated methods', async () => {
          for (let i = 0; i < badArgs.length; i++) {
            const arg = badArgs[i];
            // $FlowIKnow
            await expect(tanker.setupUnlock(arg), `setup test n°${i}`).to.be.rejectedWith(InvalidArgument);
            // $FlowIKnow
            await expect(tanker.updateUnlock(arg), `update test n°${i}`).to.be.rejectedWith(InvalidArgument);
          }
        });
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

      describe('deprecated util', () => {
        before(() => warnings.silence(/deprecated/));
        after(() => warnings.restore());

        it('should throw when given an invalid type', async () => {
          notUint8ArrayValues.forEach((v, i) => {
            // $FlowExpectedError
            expect(() => getResourceId(v), `bad resource #${i}`).to.throw(InvalidArgument);
          });
        });
      });
    });

    describe('shareWith', () => {
      const notShareWithValues = [
        null,
        0,
        'noArrayAroundMe',
        { shareWith: ['bob'], shareWithGroups: ['admin group'] },
        { shareWithGroups: 'noArrayAroundMe' },
        { shareWithGroups: [new Uint8Array(32)] },
        { shareWithUsers: 'noArrayAroundMe' },
        { shareWithUsers: [undefined] },
      ];

      before(() => warnings.silence(/deprecated/));
      after(() => warnings.restore());

      it('share() should throw when given an invalid shareWith', async () => {
        notShareWithValues.push(undefined);
        notShareWithValues.push([{ shareWithUsers: ['userId'] }]); // unexpected extra outer array
        const resourceId = random(tcrypto.MAC_SIZE);

        for (let i = 0; i < notShareWithValues.length; i++) {
          const v = notShareWithValues[i];
          // $FlowExpectedError
          await expect(tanker.share([resourceId], v), `bad shareWith #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });
  });
});
