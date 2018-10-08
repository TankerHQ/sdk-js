// @flow
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
