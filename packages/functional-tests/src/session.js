// @flow
import { errors, statuses } from '@tanker/core';
import { createIdentity } from '@tanker/identity';
import { expect, silencer } from '@tanker/test-utils';
import { utils } from '@tanker/crypto';

import type { TestArgs } from './helpers';

const { STOPPED, READY, IDENTITY_REGISTRATION_NEEDED, IDENTITY_VERIFICATION_NEEDED } = statuses;

export const generateSessionTests = (args: TestArgs) => {
  describe('start', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.appHelper.generateIdentity();
      bobLaptop = args.makeTanker();
    });

    afterEach(async () => {
      bobLaptop.stop();
    });

    it('has STOPPED status before start', async () => {
      expect(bobLaptop.status).to.equal(STOPPED);
    });

    it('throws when having configured a non existing app', async () => {
      const silenceError = silencer.silence('error', /trustchain_not_found/);

      const nonExistentB64AppSecret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
      const publicKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
      const publicKeyBytes = utils.fromBase64(publicKey);
      const nonExistentB64AppId = utils.toBase64(utils.generateAppID(publicKeyBytes));
      const userId = 'bob';
      bobIdentity = await createIdentity(nonExistentB64AppId, nonExistentB64AppSecret, userId);
      const bobMobile = args.makeTanker(nonExistentB64AppId);
      await expect(bobMobile.start(bobIdentity)).to.be.rejectedWith(errors.PreconditionFailed, 'trustchain_not_found');
      await bobMobile.stop();

      silenceError.restore();
    });

    it('throws when giving invalid arguments', async () => {
      // $FlowExpectedError
      await expect(bobLaptop.start()).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when giving an invalid identity', async () => {
      await expect(bobLaptop.start('secret')).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('returns IDENTITY_REGISTRATION_NEEDED status if new identity provided', async () => {
      await bobLaptop.start(bobIdentity);
      await expect(bobLaptop.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
    });

    it('returns IDENTITY_VERIFICATION_NEEDED status if identity of existing user provided on new device', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

      const bobPhone = args.makeTanker();
      await bobPhone.start(bobIdentity);
      await expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      await bobPhone.stop();
    });

    it('returns READY status if identity of existing user provided on existing device', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.stop();

      await bobLaptop.start(bobIdentity);
      await expect(bobLaptop.status).to.equal(READY);
    });
  });

  describe('stop', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.appHelper.generateIdentity();
      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
    });

    afterEach(async () => {
      bobLaptop.stop();
    });

    it('stops the session when a "session error" is sent from the server', async () => {
      const silenceError = silencer.silence('error', /trustchain_not_found/);

      const expectPromise = Promise.race([
        new Promise((_, reject) => setTimeout(() => reject(new Error('Test should have succeeded much faster')), 1000)),
        new Promise(resolve => {
          bobLaptop.on('statusChange', (status) => {
            expect(status).to.equal(STOPPED);
            resolve();
          });
        }),
      ]);

      // Simulate a server sent event
      bobLaptop.session._client.socket.socket.onpacket({ // eslint-disable-line no-underscore-dangle
        type: 2,
        nsp: '/',
        data: [
          'session error',
          '{"error":{"status":404,"code":"trustchain_not_found","message":"This trustchain does not exist","error":null}}',
        ]
      });

      await expect(expectPromise).to.be.fulfilled;

      silenceError.restore();
    });
  });

  describe('registerIdentity', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.appHelper.generateIdentity();
      bobLaptop = args.makeTanker();
    });

    afterEach(async () => {
      await bobLaptop.stop();
    });

    it('throws when giving invalid arguments', async () => {
      await bobLaptop.start(bobIdentity);

      await Promise.all([undefined, 'none', ['none'], [{ none: true }], { none: 'none' }].map(arg => { /* eslint-disable-line arrow-body-style */
        // $FlowExpectedError
        return expect(bobLaptop.registerIdentity(arg)).to.be.rejectedWith(errors.InvalidArgument);
      }));
    });

    it('throws when registering before having started a session', async () => {
      await expect(bobLaptop.registerIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(errors.PreconditionFailed);
    });

    it('creates the first device with the passphrase method', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await expect(bobLaptop.status).to.equal(READY);
    });

    it('re-start the first device created with the passphrase method', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await expect(bobLaptop.status).to.equal(READY);
      await bobLaptop.stop();
      await expect(bobLaptop.status).to.equal(STOPPED);
      await bobLaptop.start(bobIdentity);
      await expect(bobLaptop.status).to.equal(READY);
    });
  });

  describe('recovery after interrupted session opening', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.appHelper.generateIdentity();
      bobLaptop = args.makeTanker();
    });

    afterEach(async () => {
      await bobLaptop.stop();
    });

    const interruptMessage = 'Browser crashed!';

    /* eslint-disable no-param-reassign, no-shadow */
    const interruptBefore = (object: any, method: string) => {
      const originalMethod = object[method];
      object[method] = () => {
        object[method] = originalMethod;
        throw new Error(interruptMessage);
      };
    };

    const interruptAfter = (object: any, method: string) => {
      const originalMethod = object[method];
      object[method] = async (...args) => {
        object[method] = originalMethod;
        await originalMethod.apply(object, args);
        throw new Error(interruptMessage);
      };
    };
    /* eslint-enable no-param-reassign, no-shadow */

    describe('during registration', () => {
      it('can start normally if interrupted just after sending user creation blocks', async () => {
        await bobLaptop.start(bobIdentity);

        // Force an exception to occur between block sending and receival during registration
        interruptBefore(bobLaptop.session._localUserManager, 'authenticate'); // eslint-disable-line no-underscore-dangle

        // Will create the device on the trustchain but fail to go further...
        await expect(bobLaptop.registerIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(interruptMessage);
        await bobLaptop.stop();

        // Will detect device exists on the trustchain, boot the session normally and receive the device creation block
        await bobLaptop.start(bobIdentity);
        await expect(bobLaptop.status).to.equal(READY);

        // Check a single device is created
        const devices = await bobLaptop.getDeviceList();
        expect(devices).to.deep.have.members([{ id: bobLaptop.deviceId, isRevoked: false }]);
      });

      it('can register normally if interrupted just after saving the deviceId locally', async () => {
        await bobLaptop.start(bobIdentity);

        // Force an exception to occur between deviceId saving and block sending during registration
        interruptAfter(bobLaptop.session._localUserManager, 'saveDeviceId'); // eslint-disable-line no-underscore-dangle

        // Will store the deviceId locally but fail to go further... the blocks and deviceId generated
        // will be lost and/or overriden by new values in the next attempt to register
        await expect(bobLaptop.registerIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(interruptMessage);
        await bobLaptop.stop();

        // Will detect the device does not exist on the trustchain, and proceed to registration normally
        await bobLaptop.start(bobIdentity);
        await expect(bobLaptop.status).to.equal(IDENTITY_REGISTRATION_NEEDED);

        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await expect(bobLaptop.status).to.equal(READY);

        // Check a single device is created
        const devices = await bobLaptop.getDeviceList();
        expect(devices).to.deep.have.members([{ id: bobLaptop.deviceId, isRevoked: false }]);
      });
    });

    describe('during verification', () => {
      let bobDesktop;

      beforeEach(async () => {
        bobDesktop = args.makeTanker();
        await bobDesktop.start(bobIdentity);
        await bobDesktop.registerIdentity({ passphrase: 'passphrase' });
      });

      afterEach(async () => {
        await bobDesktop.stop();
      });

      it('can start normally if interrupted just after sending device creation block', async () => {
        await bobLaptop.start(bobIdentity);

        // Force an exception to occur between block sending and receival during verification
        interruptBefore(bobLaptop.session._localUserManager, 'authenticate'); // eslint-disable-line no-underscore-dangle

        // Will create the device on the trustchain but fail to go further...
        await expect(bobLaptop.verifyIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(interruptMessage);
        await bobLaptop.stop();

        // Will detect device exists on the trustchain, boot the session normally and receive the device creation block
        await bobLaptop.start(bobIdentity);
        await expect(bobLaptop.status).to.equal(READY);

        // Check no extra device is created
        const devices = await bobLaptop.getDeviceList();
        expect(devices).to.deep.have.members([
          { id: bobDesktop.deviceId, isRevoked: false },
          { id: bobLaptop.deviceId, isRevoked: false },
        ]);
      });

      it('can verify normally if interrupted just after saving the deviceId locally', async () => {
        await bobLaptop.start(bobIdentity);

        // Force an exception to occur between deviceId saving and block sending during registration
        interruptAfter(bobLaptop.session._localUserManager, 'saveDeviceId'); // eslint-disable-line no-underscore-dangle

        // Will store the deviceId locally but fail to go further... the block and deviceId generated
        // will be lost and/or overriden by new values in the next attempt to register
        await expect(bobLaptop.verifyIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(interruptMessage);
        await bobLaptop.stop();

        // Will detect the device does not exist on the trustchain, and proceed to registration normally
        await bobLaptop.start(bobIdentity);
        await expect(bobLaptop.status).to.equal(IDENTITY_VERIFICATION_NEEDED);

        await bobLaptop.verifyIdentity({ passphrase: 'passphrase' });
        await expect(bobLaptop.status).to.equal(READY);

        // Check no extra device is created
        const devices = await bobLaptop.getDeviceList();
        expect(devices).to.deep.have.members([
          { id: bobDesktop.deviceId, isRevoked: false },
          { id: bobLaptop.deviceId, isRevoked: false },
        ]);
      });
    });
  });
};
