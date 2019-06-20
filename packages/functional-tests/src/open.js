// @flow
import { errors, statuses } from '@tanker/core';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const { STOPPED, READY, IDENTITY_REGISTRATION_NEEDED, IDENTITY_VERIFICATION_NEEDED } = statuses;

const generateOpenTests = (args: TestArgs) => {
  describe('start', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.trustchainHelper.generateIdentity();
      bobLaptop = args.makeTanker();
    });

    afterEach(async () => {
      bobLaptop.stop();
    });

    it('default status to be STOPPED', async () => {
      expect(bobLaptop.status).to.equal(STOPPED);
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
    });

    it('returns READY status if identity of existing user provided on existing device', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobLaptop.stop();

      await bobLaptop.start(bobIdentity);
      await expect(bobLaptop.status).to.equal(READY);
    });

    it('can recover and start normally if interrupted just after sending creation blocks', async () => {
      const interruptMessage = 'Browser crashed!';

      await bobLaptop.start(bobIdentity);

      // Force an exception to occur between block sending and receival during registration
      bobLaptop._session.authenticate = () => { // eslint-disable-line no-underscore-dangle
        throw new Error(interruptMessage);
      };

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
  });

  describe('registerIdentity', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.trustchainHelper.generateIdentity();
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

    it('reopen the first device created with the passphrase method', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await expect(bobLaptop.status).to.equal(READY);
      await bobLaptop.stop();
      await expect(bobLaptop.status).to.equal(STOPPED);
      await bobLaptop.start(bobIdentity);
      await expect(bobLaptop.status).to.equal(READY);
    });
  });
};

export default generateOpenTests;
