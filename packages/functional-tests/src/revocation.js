// @flow
import { errors, statuses } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect, fail, sinon } from '@tanker/test-utils';

import type { TestArgs } from './helpers';

const isIE = typeof navigator !== 'undefined' && !!navigator.userAgent.match(/Trident\/7\./);

const generateRevocationTests = (args: TestArgs) => {
  describe('revocation', () => {
    // IE revocation tests don't work.
    // Events are not fired correctly for some reason
    if (isIE) return;

    let bobIdentity;
    let bobPublicIdentity;
    let bobLaptop;
    let bobPhone;

    beforeEach(async () => {
      bobIdentity = await args.appHelper.generateIdentity();
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();

      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

      await bobPhone.start(bobIdentity);
      await bobPhone.verifyIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await Promise.all([
        bobLaptop.stop(),
        bobPhone.stop(),
      ]);
    });

    it('fires a revoked event on the revoked device only', async () => {
      let bobPhoneRevoked = false;
      bobPhone.on('deviceRevoked', () => { bobPhoneRevoked = true; });
      bobLaptop.on('deviceRevoked', () => fail('Unexpected revocation of bobLaptop'));

      await bobLaptop.revokeDevice(bobPhone.deviceId);

      await expect(bobPhone.encrypt('message')).to.be.rejectedWith(errors.DeviceRevoked);
      await expect(bobPhoneRevoked).to.be.true;
    });

    it('wipes the storage of the revoked device', async () => {
      const destroy = sinon.spy(bobPhone.session._storage, 'nuke'); //eslint-disable-line no-underscore-dangle
      try {
        await bobLaptop.revokeDevice(bobPhone.deviceId);

        await expect(bobPhone.encrypt('message')).to.be.rejectedWith(errors.DeviceRevoked);
        expect(destroy.calledOnce).to.be.true;
      } finally {
        destroy.restore();
      }
    });

    it('will close a Tanker session on a device revoked while closed', async () => {
      const bobPhoneDeviceId = bobPhone.deviceId;
      await bobPhone.stop();
      await bobLaptop.revokeDevice(bobPhoneDeviceId);

      await bobPhone.start(bobIdentity);
      await expect(bobPhone.encrypt('message')).to.be.rejectedWith(errors.DeviceRevoked);
      expect(bobPhone.status).to.equal(statuses.STOPPED);
    });

    it('can list a User\'s active and revoked devices', async () => {
      const laptopId = bobLaptop.deviceId;
      const phoneId = bobPhone.deviceId;

      await bobLaptop.revokeDevice(bobPhone.deviceId);

      let devices = await bobLaptop.getDeviceList();
      expect(devices.length).to.equal(2);

      // order: laptop first, phone second
      if (devices[0].id === phoneId)
        devices = [devices[1], devices[0]];

      const laptopCandidate = devices[0];
      const phoneCandidate = devices[1];

      expect(laptopCandidate.id).to.equal(laptopId);
      expect(laptopCandidate.isRevoked).to.be.false;

      expect(phoneCandidate.id).to.equal(phoneId);
      expect(phoneCandidate.isRevoked).to.be.true;
    });

    it('can access encrypted resources when having another revoked device', async () => {
      await bobLaptop.revokeDevice(bobPhone.deviceId);
      const message = 'test';
      const encrypted = await bobLaptop.encrypt(message);
      const clear = await bobLaptop.decrypt(encrypted);
      expect(clear).to.eq(message);
    });

    it('can create a device after revoking', async () => {
      await bobLaptop.revokeDevice(bobPhone.deviceId);

      const bobNewPhone = args.makeTanker();
      await bobNewPhone.start(bobIdentity);
      await expect(bobNewPhone.verifyIdentity({ passphrase: 'passphrase' })).to.be.fulfilled;
      await bobNewPhone.stop();
    });

    it('can revoke multiple devices successively', async () => {
      await bobPhone.revokeDevice(bobLaptop.deviceId);
      await bobPhone.revokeDevice(bobPhone.deviceId);
    });

    it('Alice can share with Bob who has a revoked device', async () => {
      const aliceIdentity = await args.appHelper.generateIdentity();
      const aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });


      await bobLaptop.revokeDevice(bobPhone.deviceId);

      const message = 'I love you';
      const encrypted = await aliceLaptop.encrypt(message, { shareWithUsers: [bobPublicIdentity] });

      const clear = await bobLaptop.decrypt(encrypted);
      expect(clear).to.eq(message);

      await expect(bobPhone.decrypt(encrypted)).to.be.rejectedWith(errors.DeviceRevoked);
      await aliceLaptop.stop();
    });
  });
};

export default generateRevocationTests;
