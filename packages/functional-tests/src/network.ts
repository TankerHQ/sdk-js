import type { Tanker, b64string } from '@tanker/core';
import { errors } from '@tanker/core';
import { expect } from '@tanker/test-utils';

import type { TestArgs } from './helpers';

const networkIssues = {
  // closed_port: { url: 'https://api.tanker.io:666' }, // slow... (20 sec timeout)
  // curl: (7) Failed to connect to api.tanker.io port 666: Operation timed out (75sec timeout)
  dns_resolution_failed: { url: 'https://no-api.tanker.io' },
  // curl: (6) Could not resolve host: noapi.tanker.io
  // non_routable_ip: { url: 'http://192.0.2.0' }, // slow... (need to enforce a timeout)
  // curl: (7) Couldn't connect to server
};

const generateNetworkIssueTests = (args: TestArgs, issueType: keyof typeof networkIssues) => {
  const clearText: string = 'Rivest Shamir Adleman';

  describe(`with ${issueType.replace(/_/g, ' ')}`, () => {
    let alicePhone: Tanker;
    let aliceLaptop: Tanker;
    let aliceIdentity: b64string;

    const { url } = networkIssues[issueType];

    const restartWithNetworkIssue = async (tankerInstance: Tanker, identity: string) => {
      // "Kill" the server
      await tankerInstance.stop();
      tankerInstance._clientOptions.url = url; // eslint-disable-line
      await tankerInstance.start(identity);
    };

    beforeEach(async () => {
      aliceIdentity = await args.appHelper.generateIdentity();
      alicePhone = args.makeTanker();
      aliceLaptop = args.makeTanker();
      await alicePhone.start(aliceIdentity);
      await alicePhone.registerIdentity({ passphrase: 'passphrase' });
      await aliceLaptop.start(aliceIdentity);
      await aliceLaptop.verifyIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await alicePhone.stop();
    });

    it('can open a local session [VDTNXV]', async () => {
      await restartWithNetworkIssue(alicePhone, aliceIdentity);
    });

    it('can decrypt a resource locally [FMHLH4]', async () => {
      const encrypted = await alicePhone.encrypt(clearText);
      await alicePhone.decrypt(encrypted);

      await restartWithNetworkIssue(alicePhone, aliceIdentity);
      const decrypted = await alicePhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('uses already created transparent session [V4VUC5]', async () => {
      await alicePhone.encrypt(clearText);

      await restartWithNetworkIssue(alicePhone, aliceIdentity);

      const encrypted = await alicePhone.encrypt(clearText);
      const decrypted = await alicePhone.decrypt(encrypted);
      expect(decrypted).to.equal(clearText);
    });

    it('decrypts all resources from a transparent session [68OTX2]', async () => {
      const encrypted = await Promise.all([
        alicePhone.encrypt(clearText),
        alicePhone.encrypt(clearText),
        alicePhone.encrypt(clearText),
      ]);

      // pull key form only one resource
      expect(await aliceLaptop.decrypt(encrypted[0])).to.equal(clearText);

      await restartWithNetworkIssue(aliceLaptop, aliceIdentity);
      for (const encryptedText of encrypted) {
        const decrypted = await aliceLaptop.decrypt(encryptedText);
        expect(decrypted).to.equal(clearText);
      }
    });

    it('throws if trying to encrypt [AFOZAL]', async () => {
      await restartWithNetworkIssue(alicePhone, aliceIdentity);
      await expect(alicePhone.encrypt(clearText)).to.be.rejectedWith(errors.NetworkError);
    });

    it('throws if trying to decrypt without the resource key [0MYRMO]', async () => {
      await alicePhone.stop();

      const encrypted = await aliceLaptop.encrypt(clearText);

      await restartWithNetworkIssue(alicePhone, aliceIdentity);
      await expect(alicePhone.decrypt(encrypted)).to.be.rejectedWith(errors.NetworkError);
      await aliceLaptop.stop();
    });
  });
};

export const generateNetworkTests = (args: TestArgs) => {
  describe('network issues', () => {
    Object.keys(networkIssues).forEach(type => generateNetworkIssueTests(args, type as keyof typeof networkIssues));
  });
};
