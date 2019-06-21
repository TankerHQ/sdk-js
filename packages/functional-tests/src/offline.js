// @flow
import { errors, type Tanker } from '@tanker/core';
import { expect } from './chai';

import { type TestArgs } from './TestArgs';

const restartWithoutServer = async (tankerInstance: Tanker, identity: string) => {
  // "Kill" the server
  await tankerInstance.stop();
  tankerInstance._clientOptions.url = 'https://noapi.tanker.io'; // eslint-disable-line
  await tankerInstance.start(identity);
};

const generateOfflineTests = (args: TestArgs) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe('Offline mode', () => {
    let alicePhone;
    let aliceIdentity;

    beforeEach(async () => {
      aliceIdentity = await args.trustchainHelper.generateIdentity();
      alicePhone = args.makeTanker();
      await alicePhone.start(aliceIdentity);
      await alicePhone.registerIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await alicePhone.stop();
    });

    it('can open a local session with no Tanker server', async () => {
      await alicePhone.stop();
      alicePhone._clientOptions.url = 'https://noapi.tanker.io'; // eslint-disable-line
      await alicePhone.start(aliceIdentity);
    });

    it('can decrypt a resource locally with no Tanker server', async () => {
      const encrypted = await alicePhone.encrypt(clearText);

      await restartWithoutServer(alicePhone, aliceIdentity);
      const decrypted = await alicePhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('throws if trying to encrypt with no Tanker server', async () => {
      await restartWithoutServer(alicePhone, aliceIdentity);
      await expect(alicePhone.encrypt(clearText)).to.be.rejectedWith(errors.NetworkError);
    });

    it('throws if trying to decrypt with no Tanker server and no key', async () => {
      await restartWithoutServer(alicePhone, aliceIdentity);

      const aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.verifyIdentity({ passphrase: 'passphrase' });
      const encrypted = await aliceLaptop.encrypt(clearText);

      await expect(alicePhone.decrypt(encrypted)).to.be.rejectedWith(errors.NetworkError);
    });
  });
};

export default generateOfflineTests;
