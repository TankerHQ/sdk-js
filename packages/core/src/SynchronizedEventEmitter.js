// @flow
import { InternalError } from '@tanker/errors';

import PromiseWrapper from './PromiseWrapper';

// Loose interface that will match any nodeJS EventEmitter or SocketIo client.
interface EventEmitter {
  on(eventName: string, cb: Function): any;
  removeListener(eventName: string, cb: Function): any;
  emit(eventName: string, ...args: Array<any>): any;
}

// Wrapper that tracks the callbacks currently running and wait for them to
// complete when being disabled.
class Listener {
  runningPromises: Array<Promise<void>> = [];
  enabled: bool = true;
  eventName: string;
  _cb: Function;

  constructor(eventName: string, callback: Function) {
    this.eventName = eventName;
    this._cb = callback;
  }

  cb = async (...args) => {
    // callback was disconnected, discard
    if (!this.enabled) return;

    // create a promise to track the current execution of the listener
    const running = new PromiseWrapper();
    this.runningPromises.push(running.promise);

    // run the callback and resolve the promise when it's finished
    try {
      // works even if cb doesn't return a promise
      await this._cb(...args);
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
// Only callbacks registered/unregistered through the SynchronizedEventEmitter
// will receive its guarantees
export default class SynchronizedEventEmitter {
  subEmitter: EventEmitter;
  lastId: number = 0;

  eventListeners = {};

  constructor(eventEmitter: EventEmitter) {
    this.subEmitter = eventEmitter;
  }

  nextListenerId = () => {
    this.lastId += 1;
    return this.lastId;
  }

  // Same as EventEmitter.prototype.on, but returns an id for removeListener
  on(eventName: string, callback: Function): number {
    const listener = new Listener(eventName, callback);
    const id = this.nextListenerId();
    this.eventListeners[id] = listener;
    this.subEmitter.on(eventName, listener.cb);
    return id;
  }

  once(eventName: string, callback: Function): number {
    let id;
    const onceCallback = async (...args) => {
      // Unsubscribe listener now, and don't wait for this listener execution
      // to finish after running the callback, or you would dead-lock...
      this.removeListener(id);
      callback(...args);
    };
    id = this.on(eventName, onceCallback);
    return id;
  }

  // Remove a listener
  // When this function returns, it is guaranteed that no callback is currently
  // running and no more callback will be run ever again
  async removeListener(id: number) {
    const listener = this.eventListeners[id];

    if (!listener)
      throw new InternalError(`could not find listener with id=${id}`);

    this.subEmitter.removeListener(listener.eventName, listener.cb);

    await listener.disable();

    delete this.eventListeners[id];
  }
}
