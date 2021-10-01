import { utils } from '@tanker/crypto';

import { InvalidBlockError } from '../errors.internal';
import type { Nature } from '../Blocks/Nature';

import { natureKind, NATURE_KIND } from '../Blocks/Nature';

import type { TrustchainCreationEntry } from './Serialize';

export const rootBlockAuthor = new Uint8Array(32);

function isTrustchainCreation(nature: Nature): boolean {
  return natureKind(nature) === NATURE_KIND.trustchain_creation;
}

export function verifyTrustchainCreation(trustchainCreation: TrustchainCreationEntry, trustchainId: Uint8Array) {
  if (!isTrustchainCreation(trustchainCreation.nature))
    throw new InvalidBlockError('invalid_nature', 'invalid nature for trustchain creation', { trustchainCreation });

  if (!utils.equalArray(trustchainCreation.author, rootBlockAuthor))
    throw new InvalidBlockError('invalid_author_for_trustchain_creation', 'author of trustchain_creation must be 0', { trustchainCreation });

  if (!utils.isNullArray(trustchainCreation.signature))
    throw new InvalidBlockError('invalid_signature', 'signature must be 0', { trustchainCreation });

  if (!utils.equalArray(trustchainCreation.hash, trustchainId))
    throw new InvalidBlockError('invalid_root_block', 'the root block does not correspond to this trustchain', { trustchainCreation, trustchainId });
}
