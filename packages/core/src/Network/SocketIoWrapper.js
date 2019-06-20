// @flow
import Socket from 'socket.io-client';

import { InternalError } from '../errors';
import PromiseWrapper from '../PromiseWrapper';
import SynchronizedEventEmitter from '../SynchronizedEventEmitter';

class Request extends PromiseWrapper<string> {
  eventName: string;

  constructor(eventName: string) {
    super();
    this.eventName = eventName;
  }
}

function logSocketError(err: any, eventName?: string): void {
  console.error(`socket.io${eventName ? ` ${eventName}` : ''}: ${err}: ${err.code}`, err);
}

/** This class wraps socket.io with a better API:
 *
 *   - emit() returns a promise instead of taking a callback. Also emit() will throw
 *     if the socket is disconnected during the request.
 *
 *     The original emit() takes a callback and the callback is only called on
 *     success, which usually leads to deadlocks.
 *
 *   - on() returns an id which can be used to remove the listener
 *
 *   - removeListener() takes a listener id as argument, is asynchronous and will wait
 *     for the running callbacks to complete before returning.
 */

export type SdkInfo = {
  version: string,
  type: string,
  trustchainId: string
};

type CreationParam = {
  socket?: Socket,
  url: string,
  sdkInfo: SdkInfo,
};

export default class SocketIoWrapper {
  socket: Socket;
  synchronizedSocket: SynchronizedEventEmitter;
  runningRequests: Array<Request> = [];

  constructor({ socket, url, sdkInfo }: CreationParam) {
    this.socket = socket || new Socket(url, { transports: ['websocket', 'polling'], autoConnect: false, query: sdkInfo });
    this.socket.on('error', e => logSocketError(e, 'error'));
    this.socket.on('connect_error', e => logSocketError(e, 'connect_error'));
    this.socket.on('disconnect', this.abortRequests);
    this.synchronizedSocket = new SynchronizedEventEmitter(this.socket);
  }

  open = () => { this.socket.open(); }

  close = () => { this.socket.close(); }

  isOpen = () => this.socket.connected

  on = (event: string, cb: Function): number => this.synchronizedSocket.on(event, cb);

  once = (event: string, cb: Function): number => this.synchronizedSocket.once(event, cb);

  removeListener = async (id: number) => this.synchronizedSocket.removeListener(id);

  abortRequests = (reason: string): void => {
    // reject all running requests and mark them as done
    for (const r of this.runningRequests) {
      r.reject(new InternalError(`emit(${r.eventName}) failed due to ${reason}`));
    }
    this.runningRequests = [];
  }

  emit = (eventName: string, data: string): Promise<string> => {
    // this request is now running and depends on socket.io
    const r = new Request(eventName);
    this.runningRequests.push(r);

    this.socket.emit(eventName, data, result => {
      // the request was already aborted, abort this processing
      if (r.settled)
        return;

      // this request is no longer running
      this.runningRequests = this.runningRequests.filter((i) => r != i); // eslint-disable-line eqeqeq

      r.resolve(result);
    });

    return r.promise;
  }
}
