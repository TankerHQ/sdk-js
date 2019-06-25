// @flow
import { utils } from '@tanker/crypto';
import type { TankerInterface, b64string } from '@tanker/core';

import { TrustchainHelper, tankerUrl, idToken } from './Helpers';
import type { TestArgs, TestResources } from './TestArgs';

import generateStreamEncryptor from './encryptorStream';
import generateEncryptTests from './encrypt';
import generateGetDeviceListTests from './getDeviceList';
import generateGroupsTests from './groups';
import generateOpenTests from './start';
import generateRevocationTests from './revocation';
import generateVerificationTests from './verification';

import { silencer } from '../../core/src/__tests__/ConsoleSilencer';

export function generateFunctionalTests(
  name: string,
  makeTanker: (trustchainId: b64string) => TankerInterface,
  generateTestResources: () => TestResources,
) {
  if (!tankerUrl || !idToken) {
    // Those functional tests create a trustchain automatically and require a TANKER_TOKEN to run
    // They also require a TANKER_URL to know to which trustchain server they should talk to
    if (process.env.CI) {
      throw new Error('Functional tests should be running, check the configuration');
    }
    console.log('skipping functional tests'); // eslint-disable-line no-console
    return;
  }

  describe(`functional-tests (${name})`, function () { // eslint-disable-line func-names
    this.timeout(30000);

    const args: TestArgs = {};

    // We need these resources right now to dynamically generate tests,
    // depending on the platform (e.g. browser vs. Node.js)
    args.resources = generateTestResources();

    before(async () => {
      silencer.silence('warn', /deprecated/);

      args.trustchainHelper = await TrustchainHelper.newTrustchain();
      const b64TrustchainId = utils.toBase64(args.trustchainHelper.trustchainId);

      args.makeTanker = () => makeTanker(b64TrustchainId);
    });

    after(async () => {
      await args.trustchainHelper.cleanup();

      silencer.restore();
    });

    generateStreamEncryptor(args);
    generateEncryptTests(args);
    generateGetDeviceListTests(args);
    generateGroupsTests(args);
    generateOpenTests(args);
    generateRevocationTests(args);
    generateVerificationTests(args);
  });
}
