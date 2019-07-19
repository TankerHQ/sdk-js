// @flow
import sinon from 'sinon';
import { errors, statuses } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import PromiseWrapper from '@tanker/core/src/PromiseWrapper';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';
import { syncTankers } from './Helpers';

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
      bobIdentity = await args.trustchainHelper.generateIdentity();
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

    const revokeBobPhone = async () => {
      const waitForPhoneRevoked = new Promise(resolve => bobPhone.once('deviceRevoked', resolve));

      await bobLaptop.revokeDevice(bobPhone.deviceId);
      const waitForLaptopRevoked = bobLaptop._session._trustchain.sync([], []); // eslint-disable-line no-underscore-dangle

      await Promise.all([waitForPhoneRevoked, waitForLaptopRevoked]);
    };

    const expectRevokedEvent = (opts) => new Promise((resolve, reject) => {
      const device = opts.on;
      device.on('deviceRevoked', () => {
        if (opts.to_be_received) {
          resolve();
        } else {
          reject(new Error('A revoked event has been received by an unexpected device'));
        }
      });
    });


    it('fires a revoked event on the revoked device only', async () => {
      const timeoutPromise = (timeout) => new Promise(resolve => setTimeout(resolve, timeout));

      const testPromise = Promise.all([
        expectRevokedEvent({ to_be_received: true, on: bobPhone }),
        Promise.race([
          expectRevokedEvent({ to_be_received: false, on: bobLaptop }),
          timeoutPromise(1000),
        ])
      ]);

      bobLaptop.revokeDevice(bobPhone.deviceId);

      await expect(testPromise).to.be.fulfilled;
    });

    it('wipes the storage of the revoked device', async () => {
      const destroy = sinon.spy(bobPhone._session.storage, 'nuke'); //eslint-disable-line no-underscore-dangle
      try {
        await revokeBobPhone();
        expect(destroy.calledOnce).to.be.true;
      } finally {
        destroy.restore();
      }
    });

    it('will close a Tanker session on a device revoked while closed', async () => {
      const bobPhoneDeviceId = bobPhone.deviceId;
      await bobPhone.stop();
      await bobLaptop.revokeDevice(bobPhoneDeviceId);

      const promiseWrapper = new PromiseWrapper();
      bobPhone.on('deviceRevoked', () => {
        promiseWrapper.resolve();
      });
      await bobPhone.start(bobIdentity);

      await promiseWrapper.promise;

      expect(bobPhone.status).to.equal(statuses.STOPPED);
    });

    it('can list a User\'s active and revoked devices', async () => {
      const laptopId = bobLaptop.deviceId;
      const phoneId = bobPhone.deviceId;

      await revokeBobPhone();

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
      await revokeBobPhone();
      const message = 'test';
      const encrypted = await bobLaptop.encrypt(message);
      const clear = await bobLaptop.decrypt(encrypted);
      expect(clear).to.eq(message);
    });

    it('can create a device after revoking', async () => {
      await revokeBobPhone();

      const bobNewPhone = args.makeTanker();
      await bobNewPhone.start(bobIdentity);
      await expect(bobNewPhone.verifyIdentity({ passphrase: 'passphrase' })).to.be.fulfilled;
      await bobNewPhone.stop();
    });

    it('Alice can share with Bob who has a revoked device', async () => {
      const aliceIdentity = await args.trustchainHelper.generateIdentity();
      const aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.registerIdentity({ passphrase: 'passphrase' });

      await revokeBobPhone();

      await syncTankers(aliceLaptop, bobLaptop);

      const message = 'I love you';
      const encrypted = await aliceLaptop.encrypt(message, { shareWithUsers: [bobPublicIdentity] });

      const clear = await bobLaptop.decrypt(encrypted);
      expect(clear).to.eq(message);

      await expect(bobPhone.decrypt(encrypted)).to.be.rejectedWith(errors.PreconditionFailed);
      await aliceLaptop.stop();
    });
  });
};

export default generateRevocationTests;
