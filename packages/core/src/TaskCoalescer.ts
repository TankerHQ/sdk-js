import { PromiseWrapper } from '@tanker/types';

const unsettledID: unique symbol = Symbol('Unsettled ID');
type Unsettled = typeof unsettledID;
function isSettled<T>(value: T | Unsettled): value is T {
  return value !== unsettledID;
}

export type Resolver<ID, Value> = (id: ID, value: Value) => void;

// TaskCoalescer allows to share results between identical tasks run concurrently.
//
// When calling `run()` with a list of IDs, the coalescer will look if a
// task is already running for any subset of the given IDs. It will re-use
// the results from the previous task for the matching IDs and run the task
// only with the remaining IDs.
export class TaskCoalescer<Value extends { id: number | string | symbol }> {
  declare _runningTasks: Partial<Record<Value['id'], PromiseWrapper<Value | Unsettled>>>;

  constructor() {
    this._runningTasks = {};
  }

  run = async (tasksHandler: (ids: Array<Value['id']>) => Promise<Array<Value>>, ids: Array<Value['id']>): Promise<Array<Value>> => {
    const newTasks: Partial<Record<Value['id'], PromiseWrapper<Value | Unsettled>>> = {};
    const newTaskIds: Array<Value['id']> = [];

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

    const resolveTasks = (tasks: Array<Value>) => {
      tasks.forEach(value => newTasks[value.id as Value['id']]!.resolve(value));
    };

    const rejectUnsettledTasks = (e: any) => {
      newTaskIds.forEach(id => newTasks[id]!.reject(e));
    };

    const handleUnsettledTasks = () => {
      newTaskIds.forEach(id => newTasks[id]!.resolve(unsettledID));
    };

    if (newTaskIds.length) {
      await tasksHandler(newTaskIds)
        .then(resolveTasks)
        .catch(rejectUnsettledTasks)
        .finally(handleUnsettledTasks);
    }

    const taskResults = await Promise.all(taskPromises);
    return taskResults.filter(isSettled);
  };
}
