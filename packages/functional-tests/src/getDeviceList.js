// @flow
import uuid from 'uuid';
import { errors } from '@tanker/core';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateGetDeviceListTests = (args: TestArgs) => {
  describe('getDeviceList', () => {
    let bobId;
    let bobIdentity;

    beforeEach(async () => {
      bobId = uuid.v4();
      bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.signUp(bobIdentity);
    });

    afterEach(async () => {
      await Promise.all([
        args.aliceLaptop.signOut(),
        args.bobLaptop.signOut(),
        args.bobPhone.signOut(),
      ]);
    });

    it('should throw when using a session in an invalid state', async () => {
      await args.bobLaptop.signOut();
      await expect(args.bobLaptop.getDeviceList()).to.be.rejectedWith(errors.InvalidSessionStatus);
    });

    it('can list the devices of a user', async () => {
      await args.bobLaptop.registerUnlock({ password: 'password' });

      await args.bobPhone.signIn(bobIdentity, { password: 'password' });

      const list1 = await args.bobLaptop.getDeviceList();
      const list2 = await args.bobPhone.getDeviceList();

      expect(list1).to.deep.equal(list2);
      expect(list1.filter(({ id }) => id === args.bobLaptop.deviceId)).to.have.lengthOf(1);
      expect(list1.filter(({ id }) => id === args.bobPhone.deviceId)).to.have.lengthOf(1);
    });

    it('does not expose ghostDevices in device list', async () => {
      await args.bobLaptop.registerUnlock({ password: 'my password' });
      await args.bobLaptop.signOut();
      await args.bobLaptop.signIn(bobIdentity);

      expect(await args.bobLaptop.getDeviceList()).to.have.length(1);
    });
  });
};

export default generateGetDeviceListTests;
