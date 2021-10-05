import { ready as cryptoReady, tcrypto, random } from '@tanker/crypto';
import { expect } from '@tanker/test-utils';
import { UpgradeRequired } from '@tanker/errors';
import { serializeBlock, unserializeBlock } from '../payloads';
import { preferredNature, NATURE_KIND } from '../Nature';

describe('blocks: payloads', () => {
  before(() => cryptoReady);

  it('should throw when unserializing unsupported block version', async () => {
    const block = {
      author: random(tcrypto.HASH_SIZE),
      signature: random(tcrypto.SIGNATURE_SIZE),
      trustchain_id: random(tcrypto.HASH_SIZE),
      payload: new Uint8Array(0),
      nature: preferredNature(NATURE_KIND.key_publish_to_device),
    };
    const serializedBlock = serializeBlock(block);
    serializedBlock[0] = 99;
    expect(() => unserializeBlock(serializedBlock)).to.throw(UpgradeRequired);
  });

  it('should throw when unserializing unknown block nature', async () => {
    const block = {
      author: random(tcrypto.HASH_SIZE),
      signature: random(tcrypto.SIGNATURE_SIZE),
      trustchain_id: random(tcrypto.HASH_SIZE),
      payload: new Uint8Array(0),
      nature: Number.MAX_SAFE_INTEGER,
    };
    const serializedBlock = serializeBlock(block);
    expect(() => unserializeBlock(serializedBlock)).to.throw(UpgradeRequired);
  });

  it('should serialize/unserialize a Block', async () => {
    const block = {
      trustchain_id: new Uint8Array(tcrypto.HASH_SIZE),
      nature: preferredNature(NATURE_KIND.key_publish_to_device),
      payload: random(450),
      author: random(tcrypto.HASH_SIZE),
      signature: random(tcrypto.SIGNATURE_SIZE),
    };

    expect(unserializeBlock(serializeBlock(block))).to.deep.equal(block);
  });
});
