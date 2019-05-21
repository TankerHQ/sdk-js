// @flow
import uuid from 'uuid';
import { errors } from '@tanker/core';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const generateGetDeviceListTests = (args: TestArgs) => {
  describe('getDeviceList', () => {
    let bobId;
    let bobIdentity;
    let bobLaptop;
    let bobPhone;

    beforeEach(async () => {
      bobId = uuid.v4();
      bobIdentity = await args.trustchainHelper.generateIdentity(bobId);
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await Promise.all([
        bobLaptop.stop(),
        bobPhone.stop(),
      ]);
    });

    it('should throw when using a session in an invalid state', async () => {
      await bobLaptop.stop();
      await expect(bobLaptop.getDeviceList()).to.be.rejectedWith(errors.InvalidSessionStatus);
    });

    it('can list the devices of a user', async () => {
      await bobPhone.start(bobIdentity);
      await bobPhone.verifyIdentity({ passphrase: 'passphrase' });

      const list1 = await bobLaptop.getDeviceList();
      const list2 = await bobPhone.getDeviceList();

      expect(list1).to.deep.equal(list2);
      expect(list1.filter(({ id }) => id === bobLaptop.deviceId)).to.have.lengthOf(1);
      expect(list1.filter(({ id }) => id === bobPhone.deviceId)).to.have.lengthOf(1);
    });

    it('does not expose ghostDevices in device list', async () => {
      expect(await bobLaptop.getDeviceList()).to.have.lengthOf(1);
    });
  });
};

export default generateGetDeviceListTests;
