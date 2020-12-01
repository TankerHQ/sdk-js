// @flow
import type { Tanker } from '@tanker/core';
import { errors, statuses } from '@tanker/core';
import { createIdentity } from '@tanker/identity';
import { expect, silencer } from '@tanker/test-utils';
import { zeroDelayGenerator } from '@tanker/http-utils';
import { random, utils } from '@tanker/crypto';

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
      await bobLaptop.stop();
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
      await expect(bobMobile.start(bobIdentity)).to.be.rejectedWith(errors.PreconditionFailed, 'app_not_found');
      await bobMobile.stop();

      silenceError.restore();
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

    it('stops a session with identity registration needed status', async () => {
      await bobLaptop.stop();
      await expect(bobLaptop.status).to.equal(STOPPED);
    });

    it('stops a session with ready or identity verification needed status', async () => {
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await expect(bobLaptop.status).to.equal(READY);
      await bobLaptop.stop();
      await expect(bobLaptop.status).to.equal(STOPPED);

      const bobPhone = args.makeTanker();
      await bobPhone.start(bobIdentity);
      await expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
      await bobPhone.stop();
      await expect(bobPhone.status).to.equal(STOPPED);
    });

    it('stops a session and rejects in-progress operations with OperationCanceled error', async () => {
      const registrationPromise = bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.stop();
      await expect(bobLaptop.status).to.equal(STOPPED);
      await expect(registrationPromise).to.be.rejectedWith(errors.OperationCanceled);
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
    /* eslint-enable no-param-reassign, no-shadow */

    describe('during registration', () => {
      it('can start and create a new device if interrupted just after sending user creation blocks', async () => {
        await bobLaptop.start(bobIdentity);

        // Force an exception to occur between block sending and receival during registration
        interruptBefore(bobLaptop.session._localUserManager, 'updateDeviceInfo'); // eslint-disable-line no-underscore-dangle

        // Will create the user on the trustchain but fail to go further... the first device is lost
        await expect(bobLaptop.registerIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(interruptMessage);
        await bobLaptop.stop();

        // Will detect user exists on the trustchain, and ask for a new identity verification to create a new device
        await bobLaptop.start(bobIdentity);
        await expect(bobLaptop.status).to.equal(IDENTITY_VERIFICATION_NEEDED);

        await bobLaptop.verifyIdentity({ passphrase: 'passphrase' });

        // Check two devices have been created
        const devices = await bobLaptop.getDeviceList();
        expect(devices).to.have.lengthOf(2);
        expect(devices).to.deep.include.members([{ id: bobLaptop.deviceId, isRevoked: false }]);
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

      it('can start and create a new device if interrupted just after sending device creation block', async () => {
        await bobLaptop.start(bobIdentity);

        // Force an exception to occur between block sending and receival during verification
        interruptBefore(bobLaptop.session._localUserManager, 'updateDeviceInfo'); // eslint-disable-line no-underscore-dangle

        // Will create the device on the trustchain but fail to go further...
        await expect(bobLaptop.verifyIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(interruptMessage);
        await bobLaptop.stop();

        // Will detect user exists on the trustchain, and ask for a new identity verification to create a new device
        await bobLaptop.start(bobIdentity);
        await expect(bobLaptop.status).to.equal(IDENTITY_VERIFICATION_NEEDED);

        await bobLaptop.verifyIdentity({ passphrase: 'passphrase' });

        // Check two devices have been created
        const devices = await bobLaptop.getDeviceList();
        expect(devices).to.have.lengthOf(3);
        expect(devices).to.deep.include.members([{ id: bobLaptop.deviceId, isRevoked: false }]);
      });
    });
  });

  describe('session expiration', () => {
    let bobIdentity;
    let bobLaptop;

    /* eslint-disable no-param-reassign, no-underscore-dangle */
    const mockExpireAccessToken = (tanker: Tanker) => {
      // $FlowExpectedError Erase internal access token to simulate token expiration
      tanker._session._client._accessToken = utils.toSafeBase64(random(32));
      // $FlowExpectedError Replace internal delay generator to retry to authenticate right away
      tanker._session._client._retryDelayGenerator = zeroDelayGenerator;
    };
    /* eslint-enable */

    beforeEach(async () => {
      bobIdentity = await args.appHelper.generateIdentity();
      bobLaptop = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await bobLaptop.stop();
    });

    it('can re-authenticate a new user after session token expiration and retry the failed operation', async () => {
      mockExpireAccessToken(bobLaptop);
      await expect(bobLaptop.encrypt('some secret')).to.be.fulfilled;
    });

    it('can re-authenticate a new device after session token expiration and retry the failed operation', async () => {
      const bobDesktop = args.makeTanker();
      await bobDesktop.start(bobIdentity);
      await bobDesktop.verifyIdentity({ passphrase: 'passphrase' });

      mockExpireAccessToken(bobDesktop);
      await expect(bobDesktop.encrypt('some secret')).to.be.fulfilled;
      await bobDesktop.stop();
    });

    it('can re-authenticate an existing device after session token expiration and retry the failed operation', async () => {
      // Reopen existing device
      await bobLaptop.stop();
      await bobLaptop.start(bobIdentity);

      mockExpireAccessToken(bobLaptop);
      await expect(bobLaptop.encrypt('some secret')).to.be.fulfilled;
    });
  });
};
