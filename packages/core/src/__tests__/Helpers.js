// @flow
import sinon from 'sinon';
import { tcrypto } from '@tanker/crypto';

import { hashBlock, type Block } from '../Blocks/Block';
import { NATURE_KIND, preferredNature, serializeTrustchainCreation } from '../Blocks/payloads';

export function makeRootBlock(trustchainKeyPair: Object) {
  // force a copy here or some tests will break
  const payload = { public_signature_key: new Uint8Array(trustchainKeyPair.publicKey) };

  const rootBlock: Block = {
    index: 1,
    trustchain_id: new Uint8Array(0),
    nature: preferredNature(NATURE_KIND.trustchain_creation),
    author: new Uint8Array(32),
    payload: serializeTrustchainCreation(payload),
    signature: new Uint8Array(tcrypto.SIGNATURE_SIZE)
  };

  rootBlock.trustchain_id = hashBlock(rootBlock);

  return rootBlock;
}

export const warnings = {
  _handle: null,
  silence: function silence(regexp: RegExp = /./) {
    if (this._handle) return;
    const warn = console.warn.bind(console);
    const silencedWarn = (...warnArgs) => !(warnArgs[0].toString() || '').match(regexp) && warn(...warnArgs);
    this._handle = sinon.stub(console, 'warn').callsFake(silencedWarn);
  },
  restore: function restore() { if (this._handle) { this._handle.restore(); this._handle = null; } }
};
