// @flow
import uuid from 'uuid';
import find from 'array-find';
import { errors, TankerStatus } from '@tanker/core';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';
import { PromiseWrapper } from './PromiseWrapper';

const { OPEN } = TankerStatus;

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
      beforeEach(async () => {
        await expect(bobLaptop.isUnlockAlreadySetUp()).to.be.eventually.false;
        await bobLaptop.generateAndRegisterUnlockKey();
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
          const verificationCode = 'ZW1haWwgbm90IHNldA=='; // any b64 value, will be ignored
          await expect(bobPhone.unlockCurrentDevice({ verificationCode })).to.be.rejectedWith(errors.InvalidUnlockVerificationCode);
          await bobPhone.close();
        });
        await expect(bobPhone.open(bobId, bobToken)).to.be.rejectedWith(errors.OperationCanceled);
        expect(bobPhone.status).to.equal(TankerStatus.CLOSED);
      });
    });
  });
};

export default generateUnlockTests;
