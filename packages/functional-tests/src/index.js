// @flow
import { utils } from '@tanker/crypto';
import type { Tanker, b64string } from '@tanker/core';
import { silencer } from '@tanker/test-utils';

import { makePrefix, AppHelper, admindUrl, appdUrl, idToken, oidcSettings } from './helpers';
import type { TestArgs, TestResources } from './helpers';

import { generateEncryptionStreamTests } from './encryptionStream';
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
  if (!admindUrl || !appdUrl || !idToken || !oidcSettings) {
    // Those functional tests create an app automatically and require TANKER_* env variables
    // to be set (see the ci repository and env variables set on the Tanker Group on GitLab)
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

    generateSessionTests(args);
    generateGetDeviceListTests(args);
    generateVerificationTests(args);
    generateEncryptionTests(args);
    generateEncryptionSessionTests(args);
    generateEncryptionStreamTests(args);
    generateGroupsTests(args);
    generateUploadTests(args);
    generateRevocationTests(args);
    generateNetworkTests(args);
    generateFakeAuthenticationTests(args);
  });
}

export { makePrefix, AppHelper, admindUrl, appdUrl, idToken, oidcSettings };
