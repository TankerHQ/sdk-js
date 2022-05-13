import { InvalidArgument } from '@tanker/errors';
import { assert, expect } from '@tanker/test-utils';
import { PromiseWrapper } from '@tanker/types';

import { TaskCoalescer } from '../TaskCoalescer';

type Value = {
  id: number
};

describe('TaskCoalescer', () => {
  let coalescer: TaskCoalescer<Value>;

  beforeEach(() => {
    coalescer = new TaskCoalescer();
  });

  it('forwards task errors', async () => {
    await expect(coalescer.run(() => { throw new InvalidArgument('error'); }, [0, 1, 2])).to.be.rejectedWith(InvalidArgument);
  });

  it('forwards errors from already in-progress task', async () => {
    const sync = new PromiseWrapper<Array<Value>>();
    const failure = coalescer.run(() => sync.promise, [0, 1, 2])
      .then(() => assert(false, 'first operation must throw'))
      .catch(() => {});

    const fromPending = coalescer.run(async () => [], [0, 1, 2]);

    sync.reject(new InvalidArgument('error'));

    await expect(fromPending).to.rejectedWith(InvalidArgument);
    await failure;
  });

  it('omits unresolved ids from resulting array', async () => {
    const taskIds = [0, 1, 2];
    expect((await coalescer.run(async (ids) => ids.slice(1).map(id => ({ id })), taskIds)).map(key => key.id)).to.deep.equal(taskIds.slice(1));
  });

  describe('when everything goes well', () => {
    type TaskIds = Array<number>;
    type ResultType = Promise<Array<Value>>;

    const checkReturns = async (returns: Array<ResultType>, expected: Array<Array<number>>) => {
      const result = (await Promise.all(returns)).map(values => values.map(val => val.id));
      expect(result).to.deep.equal(expected);
    };
    const checkHandledIds = (handledIds: Array<TaskIds>, expected: Array<TaskIds>) => {
      expect(handledIds).to.deep.equal(expected);
    };
    const checkCounts = (counts: Record<number, number>, ids: Array<number>, expected: number = 1) => {
      for (const id of ids) {
        expect(counts[id]).to.equal(expected);
      }
    };

    const generateTestState = (taskIdsArgs: Array<TaskIds>, counts: Record<number, number> = {}) => {
      const results: Array<ResultType> = [];
      const startedHandler: Array<Promise<void>> = [];
      const handledIds: Array<TaskIds> = [];
      const unblockHandler: Array<PromiseWrapper<void>> = [];

      const makeTasksHandler = (ready: PromiseWrapper<void>) => async (ids: TaskIds) => {
        const sync = new PromiseWrapper<void>();
        unblockHandler.push(sync);

        ready.resolve();
        await sync.promise;

        handledIds.push(ids);
        for (const id of ids) {
          counts[id] = (counts[id] || 0) + 1; // eslint-disable-line no-param-reassign
        }

        return ids.map(id => ({ id }));
      };

      for (const taskIds of taskIdsArgs) {
        const ready = new PromiseWrapper<void>();
        startedHandler.push(ready.promise);

        results.push(coalescer.run(makeTasksHandler(ready), taskIds));
      }
      return { results, startedHandler, handledIds, unblockHandler, counts };
    };

    it('resolves task responses out of order', async () => {
      const taskIdsArgs = [[0], [1], [2]];
      const { results, startedHandler, handledIds, unblockHandler } = generateTestState(taskIdsArgs);

      await Promise.all(startedHandler);

      unblockHandler[1]!.resolve();
      unblockHandler[0]!.resolve();
      unblockHandler[2]!.resolve();

      await checkReturns(results, taskIdsArgs);
      checkHandledIds(handledIds, [[1], [0], [2]]);
    });

    it('calls tasksHandler with missing ids only', async () => {
      const taskIdsArgs = [[0, 1], [1, 2]];
      const { results, startedHandler, handledIds, unblockHandler } = generateTestState(taskIdsArgs);

      await Promise.all(startedHandler);
      for (const promise of unblockHandler) {
        promise.resolve();
      }

      await checkReturns(results, taskIdsArgs);
      checkHandledIds(handledIds, [[0, 1], [2]]);
    });

    it('does not call the tasksHandler if all tasks from newer runs can be coalesced', async () => {
      const taskIds = [0, 1, 2];
      const { results, startedHandler, handledIds, unblockHandler, counts } = generateTestState([taskIds, taskIds, [2]]);

      await startedHandler[0]!;
      for (const promise of unblockHandler) {
        promise.resolve();
      }

      await checkReturns(results, [taskIds, taskIds, [2]]);
      checkHandledIds(handledIds, [[0, 1, 2]]);
      checkCounts(counts, [0, 1, 2]);
    });

    it('calls tasksHandler with ids again once previous tasks are resolved', async () => {
      const taskIdsArgs = [[0, 1, 2]];

      const counts: Record<number, number> = {};
      for (let numBatch = 1; numBatch <= 2; numBatch++) {
        const { results, startedHandler, unblockHandler } = generateTestState(taskIdsArgs, counts);
        await Promise.all(startedHandler);
        for (const promise of unblockHandler) {
          promise.resolve();
        }

        await checkReturns(results, taskIdsArgs);
        checkCounts(counts, [0, 1, 2], numBatch);
      }
    });
  });
});
