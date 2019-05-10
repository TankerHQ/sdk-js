// @flow
import { Tanker, errors } from '@tanker/core';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const generateOpenTests = (args: TestArgs) => {
  describe('signIn/signUp', () => {
    let bobIdentity;
    let bobLaptop;
    let bobPhone;

    beforeEach(async () => {
      bobIdentity = await args.trustchainHelper.generateIdentity();
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();
    });

    afterEach(async () => {
      await Promise.all([
        bobLaptop.signOut(),
        bobPhone.signOut(),
      ]);
    });

    it('throws when giving invalid arguments', async () => {
      // $FlowExpectedError
      await expect(bobLaptop.signIn()).to.be.rejectedWith(errors.InvalidArgument);
      // $FlowExpectedError
      await expect(bobLaptop.signUp()).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when giving an invalid identity', async () => {
      await expect(bobLaptop.signIn('secret')).to.be.rejectedWith(errors.InvalidIdentity);
      await expect(bobLaptop.signUp('secret')).to.be.rejectedWith(errors.InvalidIdentity);
    });

    it('throws when trying to signUp twice', async () => {
      await bobLaptop.signUp(bobIdentity);
      await expect(bobPhone.signUp(bobIdentity)).to.be.rejectedWith(errors.IdentityAlreadyRegistered);
    });

    it('rejects when trying to signIn without signUp beforehand', async () => {
      const signInResult = await bobLaptop.signIn(bobIdentity);
      await expect(signInResult).to.equal(Tanker.signInResult.IDENTITY_NOT_REGISTERED);
    });

    it('throws when the session has already been opened', async () => {
      await bobLaptop.signUp(bobIdentity);
      await expect(bobLaptop.signIn(bobIdentity)).to.be.rejectedWith(errors.InvalidSessionStatus);
    });

    it('creates an account', async () => {
      await bobLaptop.signUp(bobIdentity);
      expect(bobLaptop.isOpen).to.be.true;
    });

    it('re-opens a session', async () => {
      await bobLaptop.signUp(bobIdentity);
      await bobLaptop.signOut();
      const signInResult = await bobLaptop.signIn(bobIdentity);
      expect(signInResult).to.equal(Tanker.signInResult.OK);
      expect(bobLaptop.isOpen).to.be.true;
    });

    it('adds multiple devices to a user', async () => {
      await bobLaptop.signUp(bobIdentity);
      const bobUnlockKey = await bobLaptop.generateAndRegisterUnlockKey();
      await bobLaptop.signOut();

      await bobPhone.signIn(bobIdentity, { unlockKey: bobUnlockKey });
      expect(bobPhone.isOpen).to.be.true;
    });

    it('adds multiple devices to a user after cancelling once', async () => {
      await bobLaptop.signUp(bobIdentity);
      const bobUnlockKey = await bobLaptop.generateAndRegisterUnlockKey();
      await bobLaptop.signOut();

      const result = await bobPhone.signIn(bobIdentity);
      await expect(result).to.equal(Tanker.signInResult.IDENTITY_VERIFICATION_NEEDED);

      expect(bobPhone.isOpen).to.be.false;

      await bobPhone.signIn(bobIdentity, { unlockKey: bobUnlockKey });
      expect(bobPhone.isOpen).to.be.true;
    });
  });
};

export default generateOpenTests;
