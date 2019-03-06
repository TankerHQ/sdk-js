// @flow
import { errors, TankerStatus, SIGN_IN_RESULT } from '@tanker/core';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const { OPEN, CLOSED } = TankerStatus;

const generateOpenTests = (args: TestArgs) => {
  describe('signIn/signUp', () => {
    let bobIdentity;

    beforeEach(async () => {
      bobIdentity = args.trustchainHelper.generateIdentity();
    });

    afterEach(async () => {
      await Promise.all([
        args.aliceLaptop.signOut(),
        args.bobLaptop.signOut(),
        args.bobPhone.signOut(),
      ]);
    });

    it('throws when giving invalid arguments', async () => {
      // $FlowExpectedError
      await expect(args.bobLaptop.signIn()).to.be.rejectedWith(errors.InvalidArgument);
      // $FlowExpectedError
      await expect(args.bobLaptop.signUp()).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when giving an invalid identity', async () => {
      // $FlowExpectedError
      await expect(args.bobLaptop.signIn('secret')).to.be.rejectedWith(errors.InvalidIdentity);
      // $FlowExpectedError
      await expect(args.bobLaptop.signUp('secret')).to.be.rejectedWith(errors.InvalidIdentity);
    });

    it('throws when trying to signUp twice', async () => {
      await args.bobLaptop.signUp(bobIdentity);
      await expect(args.bobPhone.signUp(bobIdentity)).to.be.rejectedWith(errors.IdentityAlreadyRegistered);
    });

    it('rejects when trying to signIn without signUp beforehand', async () => {
      const signInResult = await args.bobLaptop.signIn(bobIdentity);
      await expect(signInResult).to.equal(SIGN_IN_RESULT.IDENTITY_NOT_REGISTERED);
    });

    it('throws when the session has already been opened', async () => {
      await args.bobLaptop.signUp(bobIdentity);
      await expect(args.bobLaptop.signIn(bobIdentity)).to.be.rejectedWith(errors.InvalidSessionStatus);
    });

    it('creates an account', async () => {
      await args.bobLaptop.signUp(bobIdentity);
      expect(args.bobLaptop.status).to.equal(OPEN);
    });

    it('re-opens a session', async () => {
      await args.bobLaptop.signUp(bobIdentity);
      await args.bobLaptop.signOut();
      const signInResult = await args.bobLaptop.signIn(bobIdentity);
      expect(signInResult).to.equal(SIGN_IN_RESULT.OK);
      expect(args.bobLaptop.status).to.equal(OPEN);
    });

    it('adds multiple devices to a user', async () => {
      await args.bobLaptop.signUp(bobIdentity);
      const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();
      await args.bobLaptop.signOut();

      await args.bobPhone.signIn(bobIdentity, { unlockKey: bobUnlockKey });
      expect(args.bobPhone.status).to.equal(OPEN);
    });

    it('adds multiple devices to a user after cancelling once', async () => {
      await args.bobLaptop.signUp(bobIdentity);
      const bobUnlockKey = await args.bobLaptop.generateAndRegisterUnlockKey();
      await args.bobLaptop.signOut();

      const result = await args.bobPhone.signIn(bobIdentity);
      await expect(result).to.equal(SIGN_IN_RESULT.IDENTITY_VERIFICATION_NEEDED);

      expect(args.bobPhone.status).to.equal(CLOSED);

      await args.bobPhone.signIn(bobIdentity, { unlockKey: bobUnlockKey });
      expect(args.bobPhone.status).to.equal(OPEN);
    });
  });
};

export default generateOpenTests;
