// @flow
import { errors, statuses } from '@tanker/core';

import { expect } from './chai';
import { type TestArgs } from './TestArgs';

const { STOPPED, READY, IDENTITY_REGISTRATION_NEEDED, IDENTITY_VERIFICATION_NEEDED } = statuses;

const generateOpenTests = (args: TestArgs) => {
  describe('create', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.trustchainHelper.generateIdentity();
      bobLaptop = args.makeTanker();
    });

    afterEach(async () => {
      bobLaptop.stop();
    });

    it('default status to be STOPPED', async () => {
      expect(bobLaptop.status).to.equal(STOPPED);
    });

    it('throws when giving invalid arguments', async () => {
      // $FlowExpectedError
      await expect(bobLaptop.start()).to.be.rejectedWith(errors.InvalidArgument);
    });

    it('throws when giving an invalid identity', async () => {
      await expect(bobLaptop.start('secret')).to.be.rejectedWith(errors.InvalidIdentity);
    });

    it('returns IDENTITY_REGISTRATION_NEEDED status if new identity provided', async () => {
      await bobLaptop.start(bobIdentity);
      await expect(bobLaptop.status).to.equal(IDENTITY_REGISTRATION_NEEDED);
    });

    it('returns IDENTITY_VERIFICATION_NEEDED status if new identity of existing user provided', async () => {
      const bobPhone = args.makeTanker();
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await bobPhone.start(bobIdentity);
      await expect(bobPhone.status).to.equal(IDENTITY_VERIFICATION_NEEDED);
    });
  });

  describe('registerIdentity', () => {
    let bobIdentity;
    let bobLaptop;

    beforeEach(async () => {
      bobIdentity = await args.trustchainHelper.generateIdentity();
      bobLaptop = args.makeTanker();
    });

    afterEach(async () => {
      await bobLaptop.stop();
    });

    it('throws when giving invalid arguments', async () => {
      await bobLaptop.start(bobIdentity);

      await Promise.all([undefined, 'none', ['none'], [{ none: true }], { none: 'none' }].map(arg => { /* eslint-disable-line arrow-body-style */
        // $FlowExpectedError
        return expect(bobLaptop.registerIdentity(arg)).to.be.rejectedWith(errors.InvalidArgument);
      }));
    });

    it('throws when registering before having started a session', async () => {
      await expect(bobLaptop.registerIdentity({ passphrase: 'passphrase' })).to.be.rejectedWith(errors.InvalidSessionStatus);
    });

    it('creates the first device with the passphrase method', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await expect(bobLaptop.status).to.equal(READY);
    });

    it('reopen the first device created with the passphrase method', async () => {
      await bobLaptop.start(bobIdentity);
      await bobLaptop.registerIdentity({ passphrase: 'passphrase' });
      await expect(bobLaptop.status).to.equal(READY);
      await bobLaptop.stop();
      await expect(bobLaptop.status).to.equal(STOPPED);
      await bobLaptop.start(bobIdentity);
      await expect(bobLaptop.status).to.equal(READY);
    });
  });
};

export default generateOpenTests;
