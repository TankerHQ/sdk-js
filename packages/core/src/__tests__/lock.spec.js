// @flow
import { PreconditionFailed } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { Lock } from '../lock';

describe('Lock', () => {
  const caller = 'caller one';
  const caller2 = 'some other function';
  let deadCallGenerator;
  let resolvedCallGenerator;
  let resolvers;
  let lock: Lock;

  beforeEach(() => {
    lock = new Lock();
    resolvers = [];
    deadCallGenerator = () => new Promise(resolve => { resolvers.push(resolve); });
    resolvedCallGenerator = () => Promise.resolve();
  });

  afterEach(async () => {
    for (const resolver of resolvers) {
      resolver();
    }
  });

  describe('state', () => {
    it('is unlocked by default', () => {
      expect(lock.owner).to.equal(null);
      expect(lock.locked).to.equal(false);
    });

    it('is locked on demand', () => {
      lock.lock(caller, deadCallGenerator);

      expect(lock.locked).to.equal(true);
    });

    it('set the _caller attribute', async () => {
      await expect(lock.lock(caller, () => new Promise((resolve) => {
        expect(lock.owner).to.eq(caller);
        resolve();
      }))).to.not.be.rejected;
    });

    it('resets to default state when unlocked', async () => {
      await lock.lock(caller, resolvedCallGenerator);

      expect(lock.owner).to.equal(null);
      expect(lock.locked).to.equal(false);
    });
  });

  it('throws when already locked', async () => {
    lock.lock(caller, deadCallGenerator);

    await expect(lock.lock(caller2, resolvedCallGenerator)).to.be.rejectedWith(PreconditionFailed);
  });

  it('is not a reentrant lock', async () => {
    lock.lock(caller, deadCallGenerator);

    await expect(lock.lock(caller, resolvedCallGenerator)).to.be.rejectedWith(PreconditionFailed);
  });

  it('forwards the return value of the given callback', async () => {
    const value = 'open';
    await expect(lock.lock('key', () => Promise.resolve(value))).eventually.equal(value);
  });
});
