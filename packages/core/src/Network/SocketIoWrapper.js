// @flow
import Socket from 'socket.io-client';
import { NetworkError } from '@tanker/errors';

import PromiseWrapper from '../PromiseWrapper';
import SynchronizedEventEmitter, { type ListenerFn } from '../SynchronizedEventEmitter';

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
  connectTimeout?: number,
  sdkInfo: SdkInfo,
};

export default class SocketIoWrapper {
  socket: Socket;
  synchronizedSocket: SynchronizedEventEmitter<Socket>;
  runningRequests: Array<Request> = [];

  constructor({ socket, url, connectTimeout, sdkInfo }: CreationParam) {
    this.socket = socket || new Socket(url, { timeout: connectTimeout, transports: ['websocket', 'polling'], autoConnect: false, query: sdkInfo });
    this.socket.on('error', e => logSocketError(e, 'error'));
    this.socket.on('session error', reason => this.abortRequests(new NetworkError(`socket disconnected by server: ${reason}`)));
    this.socket.on('disconnect', reason => this.abortRequests(new NetworkError(`socket disconnected: ${reason}`)));
    this.synchronizedSocket = new SynchronizedEventEmitter(this.socket);
  }

  open = () => { this.socket.open(); }

  close = () => { this.socket.close(); }

  isOpen = () => this.socket.connected

  on = (event: string, listener: ListenerFn): number => this.synchronizedSocket.on(event, listener);

  once = (event: string, listener: ListenerFn): number => this.synchronizedSocket.once(event, listener);

  removeListener = async (id: number) => this.synchronizedSocket.removeListener(id);

  abortRequests = (error: Error): void => {
    // reject all running requests and mark them as done
    for (const r of this.runningRequests) {
      r.reject(error);
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
