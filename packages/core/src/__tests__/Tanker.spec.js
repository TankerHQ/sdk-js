// @flow

import { tcrypto, utils, random, obfuscateUserId } from '@tanker/crypto';

import { expect } from './chai';
import dataStoreConfig, { makePrefix } from './TestDataStore';
import { warnings } from './Helpers';

import { Tanker, TankerStatus, getResourceId } from '..';
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

      expect(() => new Tanker({ trustchainId: 'ok', dataStore: { ...dataStoreConfig, prefix: makePrefix() } })).not.to.throw;
    });

    it('class should have configurable defaults', () => {
      const dataStore = { ...dataStoreConfig, prefix: makePrefix() };
      const TankerA = Tanker.defaults({ trustchainId: 'trustchainA', url: 'http://default.io', dataStore });
      // $FlowExpectedError
      let tankerA = new TankerA({});

      // check types
      expect(tankerA instanceof TankerA).to.be.true;
      expect(tankerA instanceof Tanker).to.be.true;

      // check defaults applied
      expect(tankerA.options.trustchainId).to.equal('trustchainA');
      expect(tankerA.options.url).to.equal('http://default.io');

      // check defaults overriden by new options
      tankerA = new TankerA({ trustchainId: 'other', url: 'http://modified.io' });
      expect(tankerA.options.trustchainId).to.equal('other');
      expect(tankerA.options.url).to.equal('http://modified.io');

      // check no defaults from TankerA applied if using Tanker constructor
      const tanker = new Tanker({ trustchainId: 'another', dataStore });
      expect(tanker.options.trustchainId).to.equal('another');
      expect(tanker.options.url).to.not.equal('http://default.io');
      expect(tanker.options.url).to.not.equal('http://modified.io');
    });

    it('class should have chainable defaults', () => {
      const dataStore = { ...dataStoreConfig, prefix: makePrefix() };
      const TankerB = Tanker.defaults({ trustchainId: 'trustchainA', url: 'http://default.io' })
                            .defaults({ trustchainId: 'trustchainB', dataStore }); // eslint-disable-line indent
      // $FlowExpectedError
      const tankerB = new TankerB({});
      expect(tankerB.options.url).to.equal('http://default.io');
      expect(tankerB.options.trustchainId).to.equal('trustchainB');
    });

    it('instance should have numeric status constants matching TankerStatus', () => {
      const statuses = ['CLOSED', 'CLOSING', 'UNLOCK_REQUIRED', 'OPEN', 'OPENING', 'USER_CREATION'];
      const dataStore = { ...dataStoreConfig, prefix: makePrefix() };
      const tanker = new Tanker({ trustchainId: 'nevermind', dataStore });

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
      });
    });

    it('should not allow to accept a device', async () => {
      await expect(tanker.acceptDevice('V1d0ak5XTXdlRVJSYmxacFRURktkbGxXWXpGaWEyeElZVWQ0YW1KV1ZUaz0=')).to.be.rejectedWith(InvalidSessionStatus);
    });

    it('should not allow to encrypt/decrypt', async () => {
      await expect(tanker.encrypt('data')).to.be.rejectedWith(InvalidSessionStatus);
      await expect(tanker.decrypt(random(100))).to.be.rejectedWith(InvalidSessionStatus);
    });

    it('should not allow to create a ChunkedEncryptor', async () => {
      await expect(tanker.makeChunkEncryptor()).to.be.rejectedWith(InvalidSessionStatus);
    });

    describe('open', () => {
      it('should throw when token is not base64', async () => {
        await expect(tanker.open(userId, 'garbage')).to.be.rejected;
        // $FlowIKnow
        await expect(tanker.open(userId, null)).to.be.rejected;
      });

      it('should throw when token is incorrect', async () => {
        // empty
        let badSecret = '';
        let userToken = createUserTokenFromSecret(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
        let promise = tanker.open(userId, userToken);
        await expect(promise).to.be.rejectedWith(InvalidUserToken);

        // wrong size
        badSecret = utils.toBase64(random(tcrypto.USER_SECRET_SIZE - 1));
        userToken = createUserTokenFromSecret(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
        promise = tanker.open(userId, userToken);
        await expect(promise).to.be.rejectedWith(InvalidUserToken);

        // does not match user
        badSecret = utils.toBase64(random(tcrypto.USER_SECRET_SIZE));
        userToken = createUserTokenFromSecret(obfuscatedUserId, trustchainKeyPair.privateKey, badSecret);
        promise = tanker.open(userId, userToken);
        await expect(promise).to.be.rejectedWith(InvalidUserToken);
      });
    });
  });

  describe('opened session', () => {
    const tanker = new Tanker({
      trustchainId: utils.toBase64(trustchainId),
      socket: {},
      dataStore: { ...dataStoreConfig, prefix: makePrefix() },
    });
    // "open" a session
    tanker._session = ({ sessionData: { deviceType: DEVICE_TYPE.client_device } }: any); // eslint-disable-line no-underscore-dangle


    describe('unlock', () => {
      describe('setupUnlock type check', () => {
        it('should throw on on invalid password type', async () => {
          // $FlowIKnow
          await expect(tanker.setupUnlock({ password: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
          // $FlowIKnow
          await expect(tanker.setupUnlock({ password: 12 })).to.be.rejectedWith(InvalidArgument);
        });

        it('should throw on on invalid email type', async () => {
          // $FlowIKnow
          await expect(tanker.setupUnlock({ email: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
        });
      });

      describe('updateUnlock type check', () => {
        it('should throw on on invalid password type', async () => {
          // $FlowIKnow
          await expect(tanker.updateUnlock({ password: 12 })).to.be.rejectedWith(InvalidArgument);
          // $FlowIKnow
          await expect(tanker.updateUnlock({ password: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
        });

        it('should throw on on invalid email type', async () => {
          // $FlowIKnow
          await expect(tanker.updateUnlock({ email: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
        });

        it('should throw on on invalid unlockKey type', async () => {
          // $FlowIKnow
          await expect(tanker.updateUnlock({ password: 'password', email: 'email', unlockKey: new Uint8Array(12) }))
            .to.be.rejectedWith(InvalidArgument);
        });
      });

      describe('registerUnlock type check', () => {
        it('should throw on on invalid password type', async () => {
          // $FlowIKnow
          await expect(tanker.registerUnlock({ password: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
          // $FlowIKnow
          await expect(tanker.registerUnlock({ password: 12 })).to.be.rejectedWith(InvalidArgument);
        });

        it('should throw on on invalid email type', async () => {
          // $FlowIKnow
          await expect(tanker.registerUnlock({ email: new Uint8Array(12) })).to.be.rejectedWith(InvalidArgument);
        });
      });
    });

    describe('getResourceId', () => {
      const notUint8ArrayValues = [undefined, null, 0, {}, [], 'str'];

      it('should throw when given an invalid argument', async () => {
        notUint8ArrayValues.forEach((v, i) => {
          // $FlowExpectedError
          expect(() => tanker.getResourceId(v), `bad resource #${i}`).to.throw(InvalidArgument);
        });
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
        undefined, null, 0,
        'noArrayAroundMe',
        { groups: 'noArrayAroundMe' },
        { groups: [new Uint8Array(32)] },
        { users: 'noArrayAroundMe' },
        { users: [undefined] },
        { users: ['userId'], unexpectedKey: 'value' },
        [{ users: ['userId'] }] // unexpected extra outer array
      ];
      const numberOfTests = notShareWithValues.length;

      it('encrypt() should throw when given an invalid shareWith', async () => {
        for (let i = 0; i < numberOfTests; i++) {
          const v = notShareWithValues[i];
          // $FlowExpectedError
          await expect(tanker.encrypt('test', { shareWith: v }), `bad shareWith #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });

      it('share() should throw when given an invalid shareWith', async () => {
        const resourceId = random(tcrypto.MAC_SIZE);

        for (let i = 0; i < numberOfTests; i++) {
          const v = notShareWithValues[i];
          // $FlowExpectedError
          await expect(tanker.share([resourceId], v), `bad shareWith #${i}`).to.be.rejectedWith(InvalidArgument);
        }
      });
    });
  });
});
