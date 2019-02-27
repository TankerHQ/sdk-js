// @flow
import uuid from 'uuid';
import { errors, TankerStatus } from '@tanker/core';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';
import { PromiseWrapper } from './PromiseWrapper';

const { OPEN, CLOSED } = TankerStatus;

const generateOpenTests = (args: TestArgs) => {
  describe('open', () => {
    afterEach(async () => {
      await Promise.all([
        args.aliceLaptop.close(),
        args.bobLaptop.close(),
        args.bobPhone.close(),
      ]);
    });

    it('throws when giving an invalid userToken', async () => {
      // $FlowExpectedError
      await expect(args.bobLaptop.open()).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when giving invalid arguments', async () => {
      // $FlowExpectedError
      await expect(args.bobLaptop.open('secret')).to.be.rejectedWith(errors.InvalidIdentity);
    });

    it('throws when the session is already opened', async () => {
      const bobId = uuid.v4();
      const bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.open(bobIdentity);
      await expect(args.bobLaptop.open(bobIdentity)).to.be.rejectedWith(errors.InvalidSessionStatus);
    });

    it('creates an account', async () => {
      const bobId = uuid.v4();
      const bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.open(bobIdentity);
      expect(args.bobLaptop.status).to.equal(OPEN);
    });

    it('re-opens a session', async () => {
      const bobId = uuid.v4();
      const bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.open(bobIdentity);
      await args.bobLaptop.close();
      await args.bobLaptop.open(bobIdentity);
      expect(args.bobLaptop.status).to.equal(OPEN);
    });

    it('unlocks a new device using the `unlockRequired` event', async () => {
      const bobId = uuid.v4();
      const bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.open(bobIdentity);
      const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();

      args.bobPhone.once('unlockRequired', async () => {
        await args.bobPhone.unlockCurrentDevice({ unlockKey: bobUnlockKey });
      });

      await args.bobPhone.open(bobIdentity);
      expect(args.bobPhone.status).to.equal(OPEN);
    });

    it('adds multiple devices to a user', async () => {
      const bobId = uuid.v4();
      const bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.open(bobIdentity);
      const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();
      await args.bobLaptop.close();

      args.bobPhone.once('unlockRequired', async () => {
        args.bobPhone.unlockCurrentDevice({ unlockKey: bobUnlockKey });
      });
      await args.bobPhone.open(bobIdentity);
      expect(args.bobPhone.status).to.equal(OPEN);
    });

    it('adds multiple devices to a user after cancelling once', async () => {
      const bobId = uuid.v4();
      const bobIdentity = args.trustchainHelper.generateIdentity(bobId);
      await args.bobLaptop.open(bobIdentity);
      const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();
      await args.bobLaptop.close();

      const closingDone = new PromiseWrapper();
      // cancel device creation once
      args.bobPhone.once('unlockRequired', async () => {
        await args.bobPhone.close();
        closingDone.resolve();
      });

      const promise = args.bobPhone.open(bobIdentity);
      await expect(promise).to.be.rejectedWith(errors.OperationCanceled);
      await closingDone.promise;

      expect(args.bobPhone.status).to.equal(CLOSED);

      // accept device
      args.bobPhone.once('unlockRequired', async () => {
        args.bobPhone.unlockCurrentDevice({ unlockKey: bobUnlockKey });
      });
      await args.bobPhone.open(bobIdentity);
      expect(args.bobPhone.status).to.equal(OPEN);
    });
  });
};

export default generateOpenTests;
