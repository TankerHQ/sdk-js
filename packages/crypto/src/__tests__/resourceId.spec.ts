import { InvalidArgument } from '@tanker/errors';
import { assert, expect, sinon } from '@tanker/test-utils';

import { random } from '../random';
import { ready } from '../ready';
import { getKeyFromCompositeResourceId } from '../resourceId';
import { MAC_SIZE, SESSION_ID_SIZE } from '../tcrypto';
import type { CompositeResourceId } from '../resourceId';

describe('getKeyFromCompositeResourceId', () => {
  let resourceId: Uint8Array;
  let sessionId: Uint8Array;
  let compositeResourceId: CompositeResourceId;

  before(async () => {
    await ready;
    resourceId = random(MAC_SIZE);
    sessionId = random(SESSION_ID_SIZE);
    compositeResourceId = {
      sessionId,
      resourceId,
    };
  });

  it('aborts lookup when keyMapper throws', async () => {
    const keyMapper = sinon.fake.throws(new Error());

    await expect(getKeyFromCompositeResourceId(compositeResourceId, keyMapper)).to.be.rejected;
    assert(keyMapper.calledOnce);
  });

  it('throws InvalidArgument when key cannot be found', async () => {
    const keyMapper = sinon.fake.returns(null);

    await expect(getKeyFromCompositeResourceId(compositeResourceId, keyMapper)).to.be.rejectedWith(InvalidArgument);
    assert(keyMapper.calledTwice);
  });
});
