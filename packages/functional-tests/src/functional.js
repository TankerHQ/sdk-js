// @flow
import sinon from 'sinon';
import uuid from 'uuid';

import { utils } from '@tanker/crypto';
import { Tanker as TankerCore } from '@tanker/core';

import { TrustchainHelper, tankerUrl, idToken } from './Helpers';

import generateChunkEncryptor from './chunkEncryptor';
import generateStreamEncryptor from './streamEncryptor';
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

export function makePrefix(length: number = 12) {
  return uuid.v4().replace('-', '').slice(0, length);
}

export function generateFunctionalTests(name: string, Tanker: any => TankerCore, dbPath?: string) {
  if (!tankerUrl || !idToken) {
    // Those functional tests create a trustchain automatically and require a TANKER_TOKEN to run
    // They also require a TANKER_URL to know to which trustchain server they should talk to
    console.log('skipping functional tests'); // eslint-disable-line no-console
    return;
  }

  const makeTanker = trustchainId => (
    new Tanker({
      trustchainId,
      dataStore: { dbPath, prefix: makePrefix() },
      url: tankerUrl,
    })
  );

  describe(`functional-tests (${name})`, function () { // eslint-disable-line func-names
    this.timeout(30000);

    const args = {};

    before(async () => {
      warnings.silence(/deprecated/);

      args.trustchainHelper = await TrustchainHelper.newTrustchain();
      args.bobLaptop = makeTanker(utils.toBase64(args.trustchainHelper.trustchainId));
      args.bobPhone = makeTanker(utils.toBase64(args.trustchainHelper.trustchainId));
      args.aliceLaptop = makeTanker(utils.toBase64(args.trustchainHelper.trustchainId));
    });

    after(async () => {
      await args.trustchainHelper.cleanup();

      warnings.restore();
    });

    generateChunkEncryptor(args);
    generateStreamEncryptor(args);
    generateEncryptTests(args);
    generateGetDeviceListTests(args);
    generateGroupsTests(args);
    generateOpenTests(args);
    generateRevocationTests(args);
    generateUnlockTests(args);
  });
}
