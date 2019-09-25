// @flow
import { InternalError } from '@tanker/errors';

import PromiseWrapper from './PromiseWrapper';

export type ListenerFn = (...args: Array<mixed>) => void | Promise<void>;

// Loose interface that will match any nodeJS EventEmitter or SocketIo client.
interface EventEmitter<T> {
  on(eventName: string, listener: ListenerFn): T;
  removeListener(eventName: string, listener: ListenerFn): T;
  emit(eventName: string, ...args: Array<any>): T | bool;
}

// Wrapper that tracks the listeners currently running and wait for them to
// complete when being disabled.
class SynchronizedListener {
  runningPromises: Array<Promise<void>> = [];
  enabled: bool = true;
  eventName: string;
  _listener: ListenerFn;

  constructor(eventName: string, listener: ListenerFn) {
    this.eventName = eventName;
    this._listener = listener;
  }

  listener = async (...args) => {
    // listener has been disconnected, discard call
    if (!this.enabled) return;

    // create a promise to track the current execution of the listener
    const running = new PromiseWrapper();
    this.runningPromises.push(running.promise);

    // run the listener and resolve the promise when it's finished
    try {
      // works even if listener doesn't return a promise
      await this._listener(...args);
    } finally {
      running.resolve();

      // remove the promise from the array (manual garbage collection)
      const promIndex = this.runningPromises.indexOf(running.promise);
      if (promIndex > -1) {
        this.runningPromises.splice(promIndex, 1);
      }
    }
  }

  disable = async (): Promise<void> => {
    this.enabled = false;
    await Promise.all(this.runningPromises); // never throws
  }
}

// This class wraps an EventEmitter and exposes a removeListener function with
// more guarantees.
//
// The wrapped EventEmitter is still usable and must be used to emit signals.
//
// Only listeners registered/unregistered through the SynchronizedEventEmitter
// will receive its guarantees
export default class SynchronizedEventEmitter<T> {
  subEmitter: EventEmitter<T>;
  lastListenerId: number = 0;

  synchronizedListeners = {};

  constructor(eventEmitter: EventEmitter<T>) {
    this.subEmitter = eventEmitter;
  }

  nextListenerId = () => {
    this.lastListenerId += 1;
    return this.lastListenerId;
  }

  // Same as EventEmitter.prototype.on, but returns an id for removeListener
  on(eventName: string, listener: ListenerFn): number {
    const synchronizedListener = new SynchronizedListener(eventName, listener);
    const id = this.nextListenerId();
    this.synchronizedListeners[id] = synchronizedListener;
    this.subEmitter.on(eventName, synchronizedListener.listener);
    return id;
  }

  once(eventName: string, listener: ListenerFn): number {
    const id = this.on(eventName, (...args) => {
      // Unsubscribe listener now, and don't wait for this listener execution
      // to finish after running the listener, or you would dead-lock...
      this.removeListener(id);
      return listener(...args);
    });

    return id;
  }

  // Remove a listener
  // When this function returns, it is guaranteed that the targeted listener is
  // not running and will never be run ever again
  async removeListener(id: number) {
    const synchronizedListener = this.synchronizedListeners[id];

    if (!synchronizedListener)
      throw new InternalError(`could not find synchronizedListener with id=${id}`);

    this.subEmitter.removeListener(synchronizedListener.eventName, synchronizedListener.listener);

    await synchronizedListener.disable();

    delete this.synchronizedListeners[id];
  }
}
