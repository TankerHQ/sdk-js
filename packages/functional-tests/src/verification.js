// @flow
import uuid from 'uuid';
import { errors, statuses, type Tanker, type Verification, type VerificationMethod } from '@tanker/core';
import { utils, type b64string } from '@tanker/crypto';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const { READY, IDENTITY_VERIFICATION_NEEDED, IDENTITY_REGISTRATION_NEEDED } = statuses;

const expectVerificationToMatchMethod = (verification: Verification, method: VerificationMethod) => {
  // $FlowExpectedError email might not be defined
  const { type, email } = method;
  expect(type in verification).to.be.true;

  if (type === 'email') {
    // $FlowIKnow I tested the 'email' type already
    expect(email).to.equal(verification.email);
  }
};

const expectVerification = async (tanker: Tanker, identity: string, verification: Verification) => {
  await tanker.start(identity);
  expect(tanker.status).to.equal(IDENTITY_VERIFICATION_NEEDED);

  // Remember for later testing
  const [method, ...otherMethods] = await tanker.getVerificationMethods();

  await tanker.verifyIdentity(verification);
  expect(tanker.status).to.equal(READY);

  // Test after verifyIdentity() to allow tests on unregistered verification types
  expect(otherMethods).to.be.an('array').that.is.empty;
  expectVerificationToMatchMethod(verification, method);
};

const generateVerificationTests = (args: TestArgs) => {
  describe('verification', () => {
    let bobLaptop;
    let bobPhone;
    let bobIdentity;
    let appHelper;

    before(() => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      const bobId = uuid.v4();
      bobIdentity = await appHelper.generateIdentity(bobId);
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
        const verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([{ type: 'email', email: 'john@doe.com' }]);
      });

      it('should fail to register an email verification method if the verification code is wrong', async () => {
        const verificationCode = await appHelper.getWrongVerificationCode('john@doe.com');
        await expect(bobLaptop.registerIdentity({ email: 'elton@doe.com', verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to register an email verification method if the verification code is not for the targeted email', async () => {
        const verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await expect(bobLaptop.registerIdentity({ email: 'elton@doe.com', verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('can test that both verification methods have been registered', async () => {
        const verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        await bobLaptop.setVerificationMethod({ passphrase: 'passphrase' });

        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([
          { type: 'email', email: 'john@doe.com' },
          { type: 'passphrase' },
        ]);
      });

      it('can test that email verification method has been updated and use it', async () => {
        let verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        // update email
        verificationCode = await appHelper.getVerificationCode('elton@doe.com');
        await bobLaptop.setVerificationMethod({ email: 'elton@doe.com', verificationCode });

        // check email is updated in cache
        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([{ type: 'email', email: 'elton@doe.com' }]);

        // check email can be used on new device
        await bobPhone.start(bobIdentity);
        verificationCode = await appHelper.getVerificationCode('elton@doe.com');
        await bobPhone.verifyIdentity({ email: 'elton@doe.com', verificationCode });

        // check received email is the updated one on new device
        expect(await bobPhone.getVerificationMethods()).to.deep.have.members([{ type: 'email', email: 'elton@doe.com' }]);
      });

      it('should fail to update the email verification method if the verification code is wrong', async () => {
        let verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        // try to update email with a code containing a typo
        verificationCode = await appHelper.getWrongVerificationCode('elton@doe.com');
        await expect(bobLaptop.setVerificationMethod({ email: 'elton@doe.com', verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('should fail to update the email verification method if the verification code is not for the targeted email', async () => {
        let verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        // try to update email with a code for another email address
        verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await expect(bobLaptop.setVerificationMethod({ email: 'elton@doe.com', verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });
    });

    describe('verification by passphrase', () => {
      it('can register a verification passphrase and open a new device with it', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'passphrase' })).to.be.fulfilled;
      });

      it('fails to verify with a wrong passphrase', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'my wrong pass' })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('fails to verify without having registered a passphrase', async () => {
        const verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'my pass' })).to.be.rejectedWith(errors.PreconditionFailed);
      });

      it('can register a verification passphrase, update it, and verify with the new passphrase only', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        await bobLaptop.setVerificationMethod({ passphrase: 'new passphrase' });

        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'passphrase' })).to.be.rejectedWith(errors.InvalidVerification);
        await bobPhone.stop();

        await expect(expectVerification(bobPhone, bobIdentity, { passphrase: 'new passphrase' })).to.be.fulfilled;
      });
    });

    describe('email verification', () => {
      it('can register a verification email and verify with a valid verification code', async () => {
        let verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await expect(expectVerification(bobPhone, bobIdentity, { email: 'john@doe.com', verificationCode })).to.be.fulfilled;
      });

      it('fails to verify with a wrong verification code', async () => {
        let verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await bobLaptop.registerIdentity({ email: 'john@doe.com', verificationCode });

        verificationCode = await appHelper.getWrongVerificationCode('john@doe.com');
        await expect(expectVerification(bobPhone, bobIdentity, { email: 'john@doe.com', verificationCode })).to.be.rejectedWith(errors.InvalidVerification);
      });

      it('fails to verify without having registered an email address', async () => {
        await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
        const verificationCode = await appHelper.getVerificationCode('john@doe.com');
        await expect(expectVerification(bobPhone, bobIdentity, { email: 'john@doe.com', verificationCode })).to.be.rejectedWith(errors.PreconditionFailed);
      });
    });

    describe('verification key', () => {
      const corruptVerificationKey = (key: b64string, field: string, position: number): b64string => {
        const unwrappedKey = utils.fromB64Json(key);
        const unwrappedField = utils.fromBase64(unwrappedKey[field]);
        unwrappedField[position] += 1;
        unwrappedKey[field] = utils.toBase64(unwrappedField);
        return utils.toB64Json(unwrappedKey);
      };

      let verificationKey;
      let verificationKeyNotUsed;

      beforeEach(async () => {
        verificationKeyNotUsed = await bobLaptop.generateVerificationKey();
        verificationKey = await bobLaptop.generateVerificationKey();
      });

      it('can use a generated verification key to register', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        expect(bobLaptop.status).to.equal(READY);
      });

      it('does list the verification key as the unique verification method', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        expect(await bobLaptop.getVerificationMethods()).to.deep.have.members([{ type: 'verificationKey' }]);
      });

      it('can verify with a verification key', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        await expect(expectVerification(bobPhone, bobIdentity, { verificationKey })).to.be.fulfilled;
      });

      it('should throw if setting another verification method after verification key has been used', async () => {
        await bobLaptop.registerIdentity({ verificationKey });
        await expect(bobLaptop.setVerificationMethod({ passphrase: 'passphrase' })).to.be.rejectedWith(errors.PreconditionFailed);
      });

      describe('register identity with an invalid verification key', () => {
        beforeEach(async () => {
          await bobPhone.start(bobIdentity);
        });

        it('throws InvalidVerification when using an obviously wrong verification key', async () => {
          await expect(bobPhone.registerIdentity({ verificationKey: 'not_a_verification_key' })).to.be.rejectedWith(errors.InvalidVerification);
        });

        it('throws InvalidVerification when using a corrupt verification key', async () => {
          const badKeys = [
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 4), // private part
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 60), // public part
            // privateEncryptionKey can't be corrupted before registration...
          ];

          for (let i = 0; i < badKeys.length; i++) {
            const badKey = badKeys[i];
            await expect(bobPhone.registerIdentity({ verificationKey: badKey }), `bad verification key #${i}`).to.be.rejectedWith(errors.InvalidVerification);
          }
        });
      });

      describe('verify identity with an invalid verification key', () => {
        beforeEach(async () => {
          await bobLaptop.registerIdentity({ verificationKey });
          await bobPhone.start(bobIdentity);
        });

        it('throws InvalidVerification when using an obviously wrong verification key', async () => {
          await expect(bobPhone.verifyIdentity({ verificationKey: 'not_a_verification_key' })).to.be.rejectedWith(errors.InvalidVerification);
        });

        it('throws InvalidVerification when using a verification key different from the one used at registration', async () => {
          await expect(bobPhone.verifyIdentity({ verificationKey: verificationKeyNotUsed })).to.be.rejectedWith(errors.InvalidVerification);
        });

        it('throws InvalidVerification when using a corrupt verification key', async () => {
          const badKeys = [
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 4), // corrupt private part
            corruptVerificationKey(verificationKey, 'privateSignatureKey', 60), // corrupt public part
            corruptVerificationKey(verificationKey, 'privateEncryptionKey', 4), // does not match the one used at registration
          ];

          for (let i = 0; i < badKeys.length; i++) {
            const badKey = badKeys[i];
            await expect(bobPhone.verifyIdentity({ verificationKey: badKey }), `bad verification key #${i}`).to.be.rejectedWith(errors.InvalidVerification);
          }
        });
      });
    });
  });
};

export default generateVerificationTests;
