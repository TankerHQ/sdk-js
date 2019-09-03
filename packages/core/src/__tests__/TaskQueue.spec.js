// @flow
import { expect } from '@tanker/test-utils';

import TaskQueue from '../TaskQueue';
import PromiseWrapper from '../PromiseWrapper';

describe('TaskQueue', () => {
  let err: Error;
  let q: TaskQueue;

  beforeEach(() => {
    err = new Error('TaskQueue test error');
    q = new TaskQueue();
  });

  describe('enqueue', () => {
    it('resolves with the result of a synchronous task', async () => {
      const syncFunc = () => 10;
      const value = await q.enqueue(syncFunc);
      expect(value).to.equal(10);
    });

    it('resolves with the result of an asynchronous task', async () => {
      const asyncFunc = () => new Promise(resolve => setTimeout(() => resolve(10), 20));
      const value = await q.enqueue(asyncFunc);
      expect(value).to.equal(10);
    });

    it('is rejected if an error occurs in a synchronous task', async () => {
      const asyncFunc = () => { throw err; };
      await expect(q.enqueue(asyncFunc)).to.be.rejectedWith(err);
    });

    it('is rejected if an error occurs in an asynchronous task', async () => {
      const asyncFunc = () => new Promise((_, reject) => setTimeout(() => reject(err), 20));
      await expect(q.enqueue(asyncFunc)).to.be.rejectedWith(err);
    });

    it('executes tasks in order', async () => {
      const pw = new PromiseWrapper();

      const resolver = () => new Promise(resolve => setTimeout(() => { pw.resolve(); resolve(); }, 20));
      const rejecter = pw.reject;

      q.enqueue(resolver);
      q.enqueue(rejecter);

      await expect(pw.promise).to.be.fulfilled;
    });
  });

  it('does not break on exceptions', async () => {
    const pw = new PromiseWrapper();

    q.enqueue(() => { throw err; }).catch(() => {});
    q.enqueue(pw.resolve);

    await expect(pw.promise).to.be.fulfilled;
  });
});
