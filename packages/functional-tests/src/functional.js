// @flow
import sinon from 'sinon';

import { utils } from '@tanker/crypto';
import { Tanker as TankerCore, type b64string } from '@tanker/core';

import { TrustchainHelper, tankerUrl, idToken } from './Helpers';
import type { TestArgs } from './TestArgs';

import generateChunkEncryptor from './chunkEncryptor';
import generateEncryptTests from './encrypt';
import generateGetDeviceListTests from './getDeviceList';
import generateGroupsTests from './groups';
import generateOpenTests from './open';
import generateRevocationTests from './revocation';
import generateUnlockTests from './unlock';

const warnings = {
  _handle: null,
  silence: function silence(regexp: RegExp = /./) {
    if (this._handle) return;
    const warn = console.warn.bind(console);
    const silencedWarn = (...warnArgs) => !(warnArgs[0].toString() || '').match(regexp) && warn(...warnArgs);
    this._handle = sinon.stub(console, 'warn').callsFake(silencedWarn);
  },
  restore: function restore() { if (this._handle) { this._handle.restore(); this._handle = null; } }
};

export function generateFunctionalTests(
  name: string,
  makeTanker: (trustchainId: b64string) => TankerCore,
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

    before(async () => {
      warnings.silence(/deprecated/);

      args.trustchainHelper = await TrustchainHelper.newTrustchain();
      const b64TrustchainId = utils.toBase64(args.trustchainHelper.trustchainId);

      args.bobLaptop = makeTanker(b64TrustchainId);
      args.bobPhone = makeTanker(b64TrustchainId);
      args.aliceLaptop = makeTanker(b64TrustchainId);
    });

    after(async () => {
      await args.trustchainHelper.cleanup();

      warnings.restore();
    });

    generateChunkEncryptor(args);
    generateEncryptTests(args);
    generateGetDeviceListTests(args);
    generateGroupsTests(args);
    generateOpenTests(args);
    generateRevocationTests(args);
    generateUnlockTests(args);
  });
}
