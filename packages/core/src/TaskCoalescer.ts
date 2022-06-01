import { PromiseWrapper } from '@tanker/types';

const unsettledId: unique symbol = Symbol('Unsettled Id');
type Unsettled = typeof unsettledId;
function isSettled<T>(value: T | Unsettled): value is T {
  return value !== unsettledId;
}

export type Resolver<Id, Value> = (id: Id, value: Value) => void;

type IdProp<T extends { id: unknown }> = T['id'];
type RunningTask<Value extends { id: number | string | symbol }> = Partial<Record<IdProp<Value>, PromiseWrapper<Value | Unsettled>>>;

// TaskCoalescer allows sharing results between identical tasks run concurrently.
//
// When calling `run()` with a list of IDs, the coalescer will look if a
// task is already running for any subset of the given IDs. It will re-use
// the results from the previous task for the matching IDs and run the task
// only with the remaining IDs.
export class TaskCoalescer<Value extends { id: number | string | symbol }> {
  declare _runningTasks: RunningTask<Value>;

  constructor() {
    this._runningTasks = {};
  }

  run = async (tasksHandler: (ids: Array<IdProp<Value>>) => Promise<Array<Value>>, ids: Array<IdProp<Value>>): Promise<Array<Value>> => {
    const newTasks: RunningTask<Value> = {};
    const newTaskIds: Array<IdProp<Value>> = [];

    const taskPromises: Array<Promise<Value | Unsettled>> = [];

    for (const id of ids) {
      let task = this._runningTasks[id];

      if (!task) {
        task = new PromiseWrapper();
        // Ensure that the tasks created by this run are always removed by this
        // run from the property this._runningTasks shared among multiple runs.
        task.promise = task.promise.finally(() => {
          delete this._runningTasks[id];
        });

        newTaskIds.push(id);
        newTasks[id] = task;

        this._runningTasks[id] = task;
      }

      taskPromises.push(task.promise);
    }

    if (newTaskIds.length) {
      try {
        const tasks = await tasksHandler(newTaskIds);
        tasks.forEach(value => newTasks[value.id as IdProp<Value>]!.resolve(value));
      } catch (e) {
        newTaskIds.forEach(id => newTasks[id]!.reject(e));
      } finally {
        newTaskIds.forEach(id => newTasks[id]!.resolve(unsettledId));
      }
    }

    const taskResults = await Promise.all(taskPromises);
    return taskResults.filter(isSettled);
  };
}
