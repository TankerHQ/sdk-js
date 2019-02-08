// @flow
import uuid from 'uuid';
import find from 'array-find';
import { errors, TankerStatus } from '@tanker/core';
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';
import { PromiseWrapper } from './PromiseWrapper';

const { OPEN, UNLOCK_REQUIRED } = TankerStatus;

const expectUnlock = (tanker, userId, userToken, asyncUnlockHandler) => {
  const pw = new PromiseWrapper();

  tanker.once('unlockRequired', async () => {
    try {
      await asyncUnlockHandler();
      pw.resolve();
    } catch (e) {
      pw.reject(e);
    }
  });

  return expect(Promise.all([
    pw.promise,
    (async () => {
      await tanker.open(userId, userToken);
      expect(tanker.status).to.equal(OPEN);
    })()
  ]));
};

const generateUnlockTests = (args: TestArgs) => {
  describe('unlock', () => {
    let bobLaptop;
    let bobPhone;
    let bobId;
    let bobToken;
    let trustchainHelper;

    before(() => {
      ({ bobLaptop, bobPhone, trustchainHelper } = args);
    });

    beforeEach(async () => {
      bobId = uuid.v4();
      bobToken = trustchainHelper.generateUserToken(bobId);
      await bobLaptop.open(bobId, bobToken);
    });

    afterEach(async () => {
      await Promise.all([
        bobLaptop.close(),
        bobPhone.close(),
      ]);
    });

    describe('method registration', () => {
      it('can test that no unlock method has been registered', async () => {
        expect(bobLaptop.hasRegisteredUnlockMethods()).to.be.false;
        expect(bobLaptop.hasRegisteredUnlockMethod('password')).to.be.false;
        expect(bobLaptop.hasRegisteredUnlockMethod('email')).to.be.false;
        expect(bobLaptop.registeredUnlockMethods).to.be.an('array').that.is.empty;
      });

      it('can test that password unlock method has been registered', async () => {
        await expect(bobLaptop.registerUnlock({ password: 'my pass' })).to.be.fulfilled;
        expect(bobLaptop.hasRegisteredUnlockMethods()).to.be.true;
        expect(bobLaptop.hasRegisteredUnlockMethod('password')).to.be.true;
        expect(bobLaptop.hasRegisteredUnlockMethod('email')).to.be.false;
        expect(bobLaptop.registeredUnlockMethods).to.deep.have.members([{ type: 'password' }]);
      });

      it('can test that email unlock method has been registered', async () => {
        await expect(bobLaptop.registerUnlock({ email: 'john@doe.com' })).to.be.fulfilled;
        expect(bobLaptop.hasRegisteredUnlockMethods()).to.be.true;
        expect(bobLaptop.hasRegisteredUnlockMethod('password')).to.be.false;
        expect(bobLaptop.hasRegisteredUnlockMethod('email')).to.be.true;
        expect(bobLaptop.registeredUnlockMethods).to.deep.have.members([{ type: 'email' }]);
      });

      it('can test that both unlock methods have been registered', async () => {
        await expect(bobLaptop.registerUnlock({ password: 'my password', email: 'john@doe.com' })).to.be.fulfilled;
        expect(bobLaptop.hasRegisteredUnlockMethods()).to.be.true;
        expect(bobLaptop.hasRegisteredUnlockMethod('password')).to.be.true;
        expect(bobLaptop.hasRegisteredUnlockMethod('email')).to.be.true;
        expect(bobLaptop.registeredUnlockMethods).to.deep.have.members([{ type: 'email' }, { type: 'password' }]);
      });
    });

    describe('faulty handlers', () => {
      it('rejects opening with error thrown by a synchronous handler', async () => {
        const errorMessage = 'Unexpected error from sync handler';
        const syncUnlockHandler = () => { throw new Error(errorMessage); };
        bobPhone.once('unlockRequired', syncUnlockHandler);
        await expect(bobPhone.open(bobId, bobToken)).to.be.rejectedWith(errorMessage);
      });
    });

    describe('device unlocking', () => {
      it('can register an unlock password and unlock a new device with it', async () => {
        await expect(bobLaptop.registerUnlock({ password: 'my pass' })).to.be.fulfilled;
        const unlockHandler = () => bobPhone.unlockCurrentDevice({ password: 'my pass' });
        await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.fulfilled;
      });

      it('fails to unlock a new device with a wrong password', async () => {
        await expect(bobLaptop.registerUnlock({ password: 'my pass' })).to.be.fulfilled;
        const unlockHandler = () => bobPhone.unlockCurrentDevice({ password: 'my wrong pass' });
        await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.rejectedWith(errors.InvalidUnlockPassword);
      });

      it('fails to unlock a new device without having registered a password', async () => {
        const unlockHandler = () => bobPhone.unlockCurrentDevice({ password: 'my pass' });
        await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.rejectedWith(errors.InvalidUnlockKey);
      });

      it('can register an unlock password, update it, and unlock a new device with the new password only', async () => {
        await expect(bobLaptop.registerUnlock({ password: 'my pass' })).to.be.fulfilled;
        await expect(bobLaptop.registerUnlock({ password: 'my new pass' })).to.be.fulfilled;

        const badUnlockHandler = () => bobPhone.unlockCurrentDevice({ password: 'my pass' });
        await expectUnlock(bobPhone, bobId, bobToken, badUnlockHandler).to.be.rejectedWith(errors.InvalidUnlockPassword);
        await bobPhone.close();

        const unlockHandler = () => bobPhone.unlockCurrentDevice({ password: 'my new pass' });
        await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.fulfilled;
      });

      it('can register an unlock email and unlock a new device with a valid verification code', async () => {
        await expect(bobLaptop.registerUnlock({ email: 'john@doe.com' })).to.be.fulfilled;
        const unlockHandler = async () => {
          const verificationCode = await trustchainHelper.getVerificationCode(bobId, 'john@doe.com');
          await bobPhone.unlockCurrentDevice({ verificationCode });
        };
        await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.fulfilled;
      });

      it('fails to unlock a new device with a wrong verification code', async () => {
        await expect(bobLaptop.registerUnlock({ email: 'john@doe.com' })).to.be.fulfilled;
        const unlockHandler = () => bobPhone.unlockCurrentDevice({ verificationCode: 'wxFeLY8V4BrUagIFv5HsWGS2qnrn/FL4D9zrphgTPXQ=' });
        await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.rejectedWith(errors.InvalidUnlockVerificationCode);
      });
    });

    describe('advanced device unlocking', () => {
      let bobUnlockKey;

      beforeEach(async () => {
        await expect(bobLaptop.isUnlockAlreadySetUp()).to.be.eventually.false;
        bobUnlockKey = await bobLaptop.generateAndRegisterUnlockKey();
      });

      it('can test if unlock is setup', async () => {
        // synchronously wait for the ghost device creation block
        await bobLaptop._session._trustchain.sync(); // eslint-disable-line no-underscore-dangle

        await expect(bobLaptop.isUnlockAlreadySetUp()).to.be.eventually.true;
      });

      it('can test if unlock is setup on a revoked ghostDevice', async () => {
        // synchronously wait for the ghost device creation block
        await bobLaptop._session._trustchain.sync(); // eslint-disable-line no-underscore-dangle

        const devices = await bobLaptop._session.userAccessor.findUserDevices({ userId: bobLaptop._session.localUser.userId }); // eslint-disable-line no-underscore-dangle
        const ghost = find(devices, device => device.isGhostDevice === true);
        await bobLaptop.revokeDevice(ghost.id);

        const isSetup = await bobLaptop.isUnlockAlreadySetUp();
        expect(isSetup).to.be.false;
      });

      it('can unlock a device with the deprecated signature of unlockCurrentDevice', async () => {
        // accept device
        bobPhone.once('unlockRequired', async () => {
          // $FlowExpectedError
          await bobPhone.unlockCurrentDevice(bobUnlockKey);
        });
        await bobPhone.open(bobId, bobToken);
        expect(bobPhone.status).to.equal(TankerStatus.OPEN);
      });

      it('should throw a nice error when password is not set', async () => {
        bobPhone.once('unlockRequired', async () => {
          await expect(bobPhone.unlockCurrentDevice({ password: 'noPasswordDefined' })).to.be.rejectedWith(errors.InvalidUnlockKey);
          await bobPhone.close();
        });
        await expect(bobPhone.open(bobId, bobToken)).to.be.rejectedWith(errors.OperationCanceled);
        expect(bobPhone.status).to.equal(TankerStatus.CLOSED);
      });

      it('should throw a nice error when password is not set and email is set', async () => {
        await expect(bobLaptop.registerUnlock({ email: 'john@doe.com' })).to.be.fulfilled;
        bobPhone.once('unlockRequired', async () => {
          await expect(bobPhone.unlockCurrentDevice({ password: 'noPasswordDefined' })).to.be.rejectedWith(errors.InvalidUnlockPassword);
          await bobPhone.close();
        });
        await expect(bobPhone.open(bobId, bobToken)).to.be.rejectedWith(errors.OperationCanceled);
        expect(bobPhone.status).to.equal(TankerStatus.CLOSED);
      });

      it('should throw a nice error when email is not set and password is set', async () => {
        await expect(bobLaptop.registerUnlock({ password: 'noEmail' })).to.be.fulfilled;
        bobPhone.once('unlockRequired', async () => {
          await expect(bobPhone.unlockCurrentDevice({ verificationCode: 'noEmailDefined' })).to.be.rejectedWith(errors.InvalidUnlockVerificationCode);
          await bobPhone.close();
        });
        await expect(bobPhone.open(bobId, bobToken)).to.be.rejectedWith(errors.OperationCanceled);
        expect(bobPhone.status).to.equal(TankerStatus.CLOSED);
      });
    });

    describe('deprecated', () => {
      describe('method setup', () => {
        it('can test if password unlock method is registered', async () => {
          await expect(bobLaptop.setupUnlock({ password: 'my pass' })).to.be.fulfilled;
          expect(bobLaptop.registeredUnlockMethods).to.deep.have.members([{ type: 'password' }]);
        });

        it('can test if email unlock method is registered', async () => {
          await expect(bobLaptop.setupUnlock({ email: 'john@doe.com' })).to.be.fulfilled;
          expect(bobLaptop.registeredUnlockMethods).to.deep.have.members([{ type: 'email' }]);
        });

        it('can test if both unlock methods are registered', async () => {
          await expect(bobLaptop.setupUnlock({ password: 'my password', email: 'john@doe.com' })).to.be.fulfilled;
          expect(bobLaptop.registeredUnlockMethods).to.deep.have.members([{ type: 'email' }, { type: 'password' }]);
        });
      });

      describe('method update', () => {
        it('can update an unlock password and unlock a new device with the new password only', async () => {
          await expect(bobLaptop.setupUnlock({ password: 'my pass' })).to.be.fulfilled;
          await expect(bobLaptop.updateUnlock({ password: 'my new pass' })).to.be.fulfilled;

          const badUnlockHandler = () => bobPhone.unlockCurrentDevice({ password: 'my pass' });
          await expectUnlock(bobPhone, bobId, bobToken, badUnlockHandler).to.be.rejectedWith(errors.InvalidUnlockPassword);
          await bobPhone.close();

          const unlockHandler = () => bobPhone.unlockCurrentDevice({ password: 'my new pass' });
          await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.fulfilled;
        });

        it('can update an unlock email and unlock a new device with a valid verification code for the new email only', async () => {
          await expect(bobLaptop.setupUnlock({ email: 'old@email.com' })).to.be.fulfilled;
          await expect(bobLaptop.setupUnlock({ email: 'new@email.com' })).to.be.fulfilled;

          const badUnlockHandler = async () => {
            const verificationCode = await trustchainHelper.getVerificationCode(bobId, 'old@email.com');
            await bobPhone.unlockCurrentDevice({ verificationCode });
          };
          await expectUnlock(bobPhone, bobId, bobToken, badUnlockHandler).to.be.rejected;
          await bobPhone.close();

          const unlockHandler = async () => {
            const verificationCode = await trustchainHelper.getVerificationCode(bobId, 'new@email.com');
            await bobPhone.unlockCurrentDevice({ verificationCode });
          };
          await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.fulfilled;
        });

        it('fails to unlock a new device with a wrong verification code', async () => {
          await expect(bobLaptop.setupUnlock({ email: 'john@doe.com' })).to.be.fulfilled;
          const unlockHandler = () => bobPhone.unlockCurrentDevice({ verificationCode: 'wxFeLY8V4BrUagIFv5HsWGS2qnrn/FL4D9zrphgTPXQ=' });
          await expectUnlock(bobPhone, bobId, bobToken, unlockHandler).to.be.rejectedWith(errors.InvalidUnlockVerificationCode);
        });
      });

      describe('device unlocking with validation code', () => {
        it('should throw when accepting a device with incorrect validation code', async () => {
          await expect(bobLaptop.acceptDevice(utils.toBase64(utils.fromString('test test'))))
            .to.be.rejectedWith(errors.InvalidDeviceValidationCode);
          await expect(bobLaptop.acceptDevice(utils.toB64Json({})))
            .to.be.rejectedWith(errors.InvalidDeviceValidationCode);
        });

        it('can unlock the device with the device validation code', async () => {
          bobPhone.once('unlockRequired', async () => {
            const validationCode = bobPhone.deviceValidationCode();
            expect(bobPhone.status).to.equal(UNLOCK_REQUIRED);
            await bobLaptop.acceptDevice(validationCode);
          });

          await bobPhone.open(bobId, bobToken);
          expect(bobPhone.status).to.equal(OPEN);
        });

        it('can unlock the device with the device validation code using deprecated signal', async () => {
          bobPhone.once('waitingForValidation', async (validationCode: string) => {
            expect(bobPhone.status).to.equal(UNLOCK_REQUIRED);
            await bobLaptop.acceptDevice(validationCode);
          });

          await bobPhone.open(bobId, bobToken);
          expect(bobPhone.status).to.equal(OPEN);
        });

        it('can be unlocked by another existing device while disconnected', async () => {
          const closingDone = new PromiseWrapper();
          let validationCode = '';
          bobPhone.once('unlockRequired', async () => {
            validationCode = bobPhone.deviceValidationCode();
            await bobPhone.close();
            closingDone.resolve();
          });
          await expect(bobPhone.open(bobId, bobToken)).to.be.rejected;
          await closingDone;

          await bobLaptop.acceptDevice(validationCode);

          await bobPhone.open(bobId, bobToken);
          expect(bobPhone.status).to.equal(OPEN);
        });
      });
    });
  });
};

export default generateUnlockTests;
