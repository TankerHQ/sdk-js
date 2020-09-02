// @flow
import { utils, random, tcrypto } from '@tanker/crypto';
import { errors, statuses } from '@tanker/core';
import { expect, sinon } from '@tanker/test-utils';

import type { TestArgs } from './helpers';

export const generateRevocationTests = (args: TestArgs) => {
  describe('revocation', () => {
    let bobIdentity;
    let bobLaptop;
    let bobPhone;

    beforeEach(async () => {
      bobIdentity = await args.appHelper.generateIdentity();
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

    it('throws an InvalidArgument error if obviously wrong deviceId provided', async () => {
      const badDeviceIds = [undefined, null, '', 'john@tanker.io', 42];

      for (let i = 0; i < badDeviceIds.length; i++) {
        const arg = ((badDeviceIds[i]: any): string);
        await expect(bobLaptop.revokeDevice(arg), `bad deviced id #${i}`).to.be.rejectedWith(errors.InvalidArgument);
      }
    });

    it('cannot revoke a non existing device', async () => {
      const fakeDeviceId = utils.toBase64(random(tcrypto.HASH_SIZE));
      await expect(bobLaptop.revokeDevice(fakeDeviceId)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('cannot revoke a device that does not belong to the same user', async () => {
      const aliceIdentity = await args.appHelper.generateIdentity();
      const aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });
      const aliceDeviceId = aliceLaptop.deviceId;
      await aliceLaptop.stop();

      await expect(bobLaptop.revokeDevice(aliceDeviceId)).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('can revoke a single device', async () => {
      await expect(bobPhone.revokeDevice(bobLaptop.deviceId)).to.be.fulfilled;
    });

    it('can revoke multiple devices successively (including self)', async () => {
      await expect(bobPhone.revokeDevice(bobLaptop.deviceId)).to.be.fulfilled;
      await expect(bobPhone.revokeDevice(bobPhone.deviceId)).to.be.fulfilled;
    });

    it('throws a PreconditionFailed error if the device is already revoked', async () => {
      await bobPhone.revokeDevice(bobLaptop.deviceId);
      await expect(bobPhone.revokeDevice(bobLaptop.deviceId)).to.be.rejectedWith(errors.PreconditionFailed);
    });

    it('can create a new device after having revoked an existing one', async () => {
      await bobLaptop.revokeDevice(bobPhone.deviceId);

      const bobNewPhone = args.makeTanker();
      await bobNewPhone.start(bobIdentity);
      await expect(bobNewPhone.verifyIdentity({ passphrase: 'passphrase' })).to.be.fulfilled;
      await bobNewPhone.stop();
    });

    it('can access resources encrypted by a (now) revoked device', async () => {
      const message = 'test';
      const encrypted = await bobPhone.encrypt(message);
      const bobPhoneId = bobPhone.deviceId;
      await bobPhone.stop();

      await bobLaptop.revokeDevice(bobPhoneId);
      const clear = await bobLaptop.decrypt(encrypted);
      expect(clear).to.eq(message);
    });

    it('can list all devices (active and revoked)', async () => {
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

    describe('when revoking a device that has an active session', () => {
      it('fails to push a block (e.g. a resource key) from the connected revoked device', async () => {
        await bobLaptop.revokeDevice(bobPhone.deviceId);
        await expect(bobPhone.encrypt('message')).to.be.rejectedWith(errors.DeviceRevoked);
      });

      it('fails to set a verification method from the connected revoked device', async () => {
        await bobLaptop.revokeDevice(bobPhone.deviceId);
        await expect(bobPhone.setVerificationMethod({ passphrase: 'updated' })).to.be.rejectedWith(errors.DeviceRevoked);
      });

      it('fires a deviceRevoked event on the revoked device only', async () => {
        let bobPhoneRevoked = false;
        let bobLaptopRevoked = false;
        bobPhone.on('deviceRevoked', () => { bobPhoneRevoked = true; });
        bobLaptop.on('deviceRevoked', () => { bobLaptopRevoked = true; });

        await bobLaptop.revokeDevice(bobPhone.deviceId);

        await expect(bobPhone.encrypt('message')).to.be.rejectedWith(errors.DeviceRevoked);
        expect(bobPhoneRevoked).to.be.true;
        expect(bobLaptopRevoked).to.be.false;
      });

      it('wipes the storage of the revoked device as soon as the revocation is detected', async () => {
        const destroy = sinon.spy(bobPhone.session._storage, 'nuke'); //eslint-disable-line no-underscore-dangle
        try {
          await bobLaptop.revokeDevice(bobPhone.deviceId);

          await expect(bobPhone.encrypt('message')).to.be.rejectedWith(errors.DeviceRevoked);
          expect(destroy.calledOnce).to.be.true;
        } finally {
          destroy.restore();
        }
      });
    });

    describe('when revoking a device that is stopped', () => {
      beforeEach(async () => {
        const bobPhoneDeviceId = bobPhone.deviceId;
        await bobPhone.stop();

        await bobLaptop.revokeDevice(bobPhoneDeviceId);
      });

      it('stops the session and fires a deviceRevoked event at restart', async () => {
        const timeoutMilliseconds = 2000;
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => {
          try {
            expect.fail('deviceRevoked event not received before timeout');
          } catch (e) {
            reject(e);
          }
        }, timeoutMilliseconds));

        const revocationEventPromise = new Promise(resolve => bobPhone.on('deviceRevoked', resolve));

        await bobPhone.start(bobIdentity);
        await Promise.race([timeoutPromise, revocationEventPromise]);

        expect(bobPhone.status).to.equal(statuses.STOPPED);
      });
    });
  });
};
