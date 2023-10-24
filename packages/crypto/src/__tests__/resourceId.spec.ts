import { InternalError, InvalidArgument } from '@tanker/errors';
import { assert, expect, sinon } from '@tanker/test-utils';

import { random } from '../random';
import { ready } from '../ready';
import { assertKey, getKeyFromCompositeResourceId } from '../resourceId';
import { RESOURCE_ID_SIZE, SESSION_ID_SIZE, SYMMETRIC_KEY_SIZE } from '../tcrypto';
import type { CompositeResourceId } from '../resourceId';

describe('getKeyFromCompositeResourceId', () => {
  let resourceId: Uint8Array;
  let sessionId: Uint8Array;
  let compositeResourceId: CompositeResourceId;

  before(async () => {
    await ready;
    resourceId = random(RESOURCE_ID_SIZE);
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

describe('assertKey', () => {
  let resourceId: Uint8Array;

  before(async () => {
    await ready;
    resourceId = random(RESOURCE_ID_SIZE);
  });

  it('succeeds when the key is a Uint8Array', () => {
    expect(() => assertKey(resourceId, new Uint8Array())).to.not.throw();
    expect(() => assertKey(resourceId, random(SYMMETRIC_KEY_SIZE))).to.not.throw();
  });

  it('throws InvalidArgument when the key is null', () => {
    expect(() => assertKey(resourceId, null)).to.throw(InvalidArgument);
  });

  it('throws InternalError when the key is falsy but not null', () => {
    //@ts-expect-error
    expect(() => assertKey(resourceId, undefined)).to.throw(InternalError);
    //@ts-expect-error
    expect(() => assertKey(resourceId, '')).to.throw(InternalError);
    //@ts-expect-error
    expect(() => assertKey(resourceId, 0)).to.throw(InternalError);
  });
});
