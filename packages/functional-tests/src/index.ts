import { ready as cryptoReady, utils } from '@tanker/crypto';
import type { Tanker, TankerOptions, b64string } from '@tanker/core';
import { silencer } from '@tanker/test-utils';

import { makePrefix, AppHelper, appdUrl, managementSettings, oidcSettings, trustchaindUrl } from './helpers';
import type { DefaultDownloadType, TestArgs, TestResources } from './helpers';

import { generateEncryptionStreamTests } from './encryptionStream';
import { generateEncryptionSessionTests } from './encryptionSession';
import { generateEncryptionTests } from './encryption';
import { generateEnrollTests } from './enroll';
import { generateNetworkTests } from './network';
import { generateGroupsTests } from './groups';
import { generateSessionTests } from './session';
import { generateUploadTests } from './upload';
import { generateVerificationTests } from './verification';
import { generateConcurrencyTests } from './concurrency';
import { generateSentryTests } from './sentry';
import { generateSessionTokenTests } from './sessionToken';

export function generateFunctionalTests(
  name: string,
  makeTanker: (appId: b64string, storagePrefix: string, extraOpts: TankerOptions) => Tanker,
  generateTestResources: () => { resources: TestResources; defaultDownloadType: DefaultDownloadType },
) {
  if (!appdUrl || !managementSettings || !oidcSettings || !trustchaindUrl) {
    // Those functional tests create an app automatically and require TANKER_* env variables
    // to be set (see the ci repository and env variables set on the Tanker Group on GitLab)
    if (process.env['CI']) {
      throw new Error('Functional tests should be running, check the configuration');
    }
    console.log('skipping functional tests'); // eslint-disable-line no-console
    return;
  }

  describe(`functional-tests (${name})`, function () { // eslint-disable-line func-names
    this.timeout(30000);

    // @ts-expect-error args will be fully defined before its usage
    const args: TestArgs = {};

    // We need these resources right now to dynamically generate tests,
    // depending on the platform (e.g. browser vs. Node.js)
    const { resources, defaultDownloadType } = generateTestResources();
    args.resources = resources;
    args.defaultDownloadType = defaultDownloadType;

    before(async () => {
      await cryptoReady;

      args.appHelper = await AppHelper.newApp(makeTanker);
      const b64DefaultAppId = utils.toBase64(args.appHelper.appId);

      args.makeTanker = (b64AppId = b64DefaultAppId, extraOpts = {}) => makeTanker(b64AppId, makePrefix(), extraOpts);

      silencer.silence('warn', /(deprecated)|('testNonce' field)/);
    });

    after(async () => {
      silencer.restore();

      if (args.appHelper) {
        await args.appHelper.cleanup();
      }
    });

    generateSessionTests(args);
    generateVerificationTests(args);
    generateEncryptionTests(args);
    generateEncryptionSessionTests(args);
    generateEncryptionStreamTests(args);
    generateEnrollTests(args);
    generateGroupsTests(args);
    generateUploadTests(args);
    generateNetworkTests(args);
    generateConcurrencyTests(args);
    generateSentryTests(args);
    generateSessionTokenTests(args);
  });
}

export { makePrefix, AppHelper, appdUrl, managementSettings, oidcSettings, trustchaindUrl };
