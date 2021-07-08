// @flow
import { expect } from '@tanker/test-utils';

import { PromiseWrapper } from '../PromiseWrapper';
import { TaskQueue } from '../TaskQueue';

describe('TaskQueue', () => {
  const err = new Error('TaskQueue test error');

  const defineEnqueueTests = (concurrency: number) => {
    describe(`enqueue with concurrency = ${concurrency}`, () => {
      let q: TaskQueue;

      beforeEach(() => {
        q = new TaskQueue(concurrency);
      });

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
        const syncFunc = () => { throw err; };
        await expect(q.enqueue(syncFunc)).to.be.rejectedWith(err);
      });

      it('is rejected if an error occurs in an asynchronous task', async () => {
        const asyncFunc = () => new Promise((_, reject) => setTimeout(() => reject(err), 20));
        await expect(q.enqueue(asyncFunc)).to.be.rejectedWith(err);
      });

      it('does not break after exceptions in previous tasks', async () => {
        const pw = new PromiseWrapper();

        q.enqueue(() => { throw err; }).catch(() => {});
        q.enqueue(pw.resolve);

        await expect(pw.promise).to.be.fulfilled;
      });

      it('executes tasks concurrently up to the maximum concurrency', async () => {
        const scheduled = [];
        const scheduledTaskIds = [];
        let nextTaskId = 0;

        const task = () => {
          if (scheduled.length >= concurrency) {
            throw new Error('The queue attempted to schedule more tasks than allowed concurrency');
          }

          nextTaskId += 1;

          const pw = new PromiseWrapper();
          const taskId = nextTaskId;
          scheduledTaskIds.push(taskId);
          scheduled.push({ resolve: () => { pw.resolve(taskId); } });

          // Resolve scheduled tasks when max concurrency reached
          if (scheduled.length === concurrency) {
            while (scheduled.length) scheduled.shift().resolve();
          }

          return pw.promise;
        };

        const promises = [];
        for (let i = 0; i < concurrency * 3; i++) {
          promises.push(q.enqueue(task));
        }

        const results = await Promise.all(promises);
        expect(results).to.deep.equal(scheduledTaskIds);
      });
    });
  };

  defineEnqueueTests(1);
  defineEnqueueTests(2);
  defineEnqueueTests(5);
});
