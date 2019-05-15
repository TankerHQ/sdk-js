// @flow
import uuid from 'uuid';
import { errors, statuses, type TankerInterface, type Verification } from '@tanker/core';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const { READY, IDENTITY_VERIFICATION_NEEDED, IDENTITY_REGISTRATION_NEEDED } = statuses;

const expectUnlock = async (tanker: TankerInterface, identity: string, verification: Verification) => {
  await tanker.start(identity);
  expect(tanker.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
  await tanker.verifyIdentity(verification);
  expect(tanker.status).to.equal(READY);
};

const generateUnlockTests = (args: TestArgs) => {
  describe('unlock', () => {
    let bobLaptop;
    let bobPhone;
    let bobIdentity;
    let trustchainHelper;

    before(() => {
      ({ trustchainHelper } = args);
    });

    beforeEach(async () => {
      const bobId = uuid.v4();
      bobIdentity = await trustchainHelper.generateIdentity(bobId);
      bobLaptop = args.makeTanker();
      bobPhone = args.makeTanker();
      await bobLaptop.start(bobIdentity);
    });

    afterEach(async () => {
      await Promise.all([
        bobLaptop.stop(),
        bobPhone.stop(),
      ]);
    });

    describe('verification method administration', () => {
      it('needs registration after start', async () => {
        expect(bobLaptop.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
      });

      it('can test that passphrase verification method has been registered', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });

        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([{ type: 'passphrase' }]);
      });

      it('can test that email verification method has been registered', async () => {
        const verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([{ type: 'email', email: 'john@doe.com' }]);
      });

      it('can test that both verification methods have been registered', async () => {
        const verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        await bobLaptop.setVerificationMethod({ passphrase: 'passphrase' });

        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([
          { type: 'email', email: 'john@doe.com' },
          { type: 'passphrase' },
        ]);
      });

      it('can test that email verification method has been updated and use it', async () => {
        let verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        // update email
        verificationCode = await trustchainHelper.getVerificationCode('elton@doe.com');
        await bobLaptop.setVerificationMethod({ email: 'elton@doe.com', verificationCode });

        // check email is updated in cache
        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([{ type: 'email', email: 'elton@doe.com' }]);

        // check email can be used on new device
        await bobPhone.start(bobIdentity);
        verificationCode = await trustchainHelper.getVerificationCode('elton@doe.com');
        await bobPhone.verifyIdentity({ email: 'elton@doe.com', verificationCode });

        // check received email is the updated one on new device
        expect(await bobPhone.getVerificationMethods()).to.deep.have.members([{ type: 'email', email: 'elton@doe.com' }]);
      });
    });

    describe('device unlocking by passphrase', () => {
      it('can register an unlock passphrase and unlock a new device with it', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await expect(expectUnlock(bobPhone, bobIdentity, { passphrase: 'passphrase' })).to.be.fulfilled;
      });

      it('fails to unlock a new device with a wrong passphrase', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await expect(expectUnlock(bobPhone, bobIdentity, { passphrase: 'my wrong pass' })).to.be.rejectedWith(errors.InvalidPassphrase);
      });

      it('fails to unlock a new device without having registered a passphrase', async () => {
        const verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        await expect(expectUnlock(bobPhone, bobIdentity, { passphrase: 'my pass' })).to.be.rejectedWith(errors.InvalidPassphrase);
      });

      it('can register an unlock passphrase, update it, and unlock a new device with the new passphrase only', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await bobLaptop.setVerificationMethod({ passphrase: 'new passphrase' });

        await expect(expectUnlock(bobPhone, bobIdentity, { passphrase: 'passphrase' })).to.be.rejectedWith(errors.InvalidPassphrase);
        await bobPhone.stop();

        await expect(expectUnlock(bobPhone, bobIdentity, { passphrase: 'new passphrase' })).to.be.fulfilled;
      });
    });

    describe('device unlocking by email', () => {
      it('can register an unlock email and unlock a new device with a valid verification code', async () => {
        let verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await expect(expectUnlock(bobPhone, bobIdentity, { email: 'john@doe.com', verificationCode })).to.be.fulfilled;
      });

      it('fails to unlock a new device with a wrong verification code', async () => {
        const verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        const correctVerificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        // introduce a typo on the first digit
        const wrongVerificationCode = (parseInt(correctVerificationCode[0], 10) + 1) % 10 + correctVerificationCode.substring(1);
        await expect(expectUnlock(bobPhone, bobIdentity, { email: 'john@doe.com', verificationCode: wrongVerificationCode })).to.be.rejectedWith(errors.InvalidVerificationCode);
      });

      it('fails to unlock a new device without having registered an email address', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        const verificationCode = await trustchainHelper.getVerificationCode('john@doe.com');
        await expect(expectUnlock(bobPhone, bobIdentity, { email: 'john@doe.com', verificationCode })).to.be.rejectedWith(errors.InvalidVerificationCode);
      });
    });

    describe('device unlocking by verification key', () => {
      let verificationKey;

      beforeEach(async () => {
        verificationKey = await bobLaptop.generateVerificationKey();
        await bobLaptop.registerIdentity({ verificationKey });
      });

      it('does list the verification key as a verification method', async () => {
        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([{ type: 'verificationKey' }]);
      });

      it('can generate a verification key and unlock a new device with it', async () => {
        await expect(expectUnlock(bobPhone, bobIdentity, { verificationKey })).to.be.fulfilled;
      });

      it('should throw if setting another verification method after verification key has been used', async () => {
        await expect(bobLaptop.setVerificationMethod({ passphrase: 'passphrase' })).to.be.rejectedWith(errors.OperationCanceled);
      });
    });
  });
};

export default generateUnlockTests;
