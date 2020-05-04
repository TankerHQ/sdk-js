// @flow
import { utils } from '@tanker/crypto';
import type { Tanker, b64string } from '@tanker/core';
import { silencer } from '@tanker/test-utils';

import { AppHelper, admindUrl, tankerUrl, idToken, oidcSettings } from './helpers';
import type { TestArgs, TestResources } from './helpers';

import { generateEncryptorStreamTests } from './encryptorStream';
import { generateEncryptionSessionTests } from './encryptionSession';
import { generateEncryptionTests } from './encryption';
import { generateFakeAuthenticationTests } from './fake-authentication';
import { generateNetworkTests } from './network';
import { generateGetDeviceListTests } from './getDeviceList';
import { generateGroupsTests } from './groups';
import { generateRevocationTests } from './revocation';
import { generateSessionTests } from './session';
import { generateUploadTests } from './upload';
import { generateVerificationTests } from './verification';

export function generateFunctionalTests(
  name: string,
  makeTanker: (appId: b64string) => Tanker,
  generateTestResources: () => TestResources,
) {
  if (!admindUrl || !tankerUrl || !idToken || !oidcSettings) {
    // Those functional tests create an app automatically and require a TANKER_CONFIG_NAME
    // and TANKER_CONFIG_FILEPATH to run
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

      args.appHelper = await AppHelper.newApp();
      const b64DefaultAppId = utils.toBase64(args.appHelper.appId);

      args.makeTanker = (b64AppId = b64DefaultAppId) => makeTanker(b64AppId);
    });

    after(async () => {
      await args.appHelper.cleanup();

      silencer.restore();
    });

    generateEncryptionTests(args);
    generateEncryptionSessionTests(args);
    generateEncryptorStreamTests(args);
    generateUploadTests(args);
    generateGetDeviceListTests(args);
    generateGroupsTests(args);
    generateSessionTests(args);
    generateRevocationTests(args);
    generateVerificationTests(args);
    generateNetworkTests(args);
    generateFakeAuthenticationTests(args);
  });
}
