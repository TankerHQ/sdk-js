// @flow
import Socket from 'socket.io-client';
import { NetworkError } from '@tanker/errors';

import PromiseWrapper from '../PromiseWrapper';

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

type Handler = (...args: Array<mixed>) => void | Promise<void>;

export type Listener = $Exact<{ event: string, handler: Handler }>;

export default class SocketIoWrapper {
  socket: Socket;
  runningRequests: Array<Request> = [];

  constructor({ socket, url, connectTimeout, sdkInfo }: CreationParam) {
    this.socket = socket || new Socket(url, {
      timeout: connectTimeout,
      transports: ['websocket'],
      // Disabling autoConnect, socket.open() must be called explicitely instead:
      autoConnect: false,
      // Disabling reconnect so that the socket will not attempt reconnections
      // after a disconnection. Instead, it will try to reconnect on next emit()
      // which creates less pressure on the server:
      reconnection: false,
      query: sdkInfo
    });
    this.socket.on('error', e => logSocketError(e, 'error'));
    this.socket.on('disconnect', reason => this.abortRequests(new NetworkError(`socket disconnected: ${reason}`)));
  }

  open = () => this.socket.open();

  close = () => this.socket.close();

  isOpen = () => this.socket.connected;

  on = (event: string, handler: Handler): number => this.socket.on(event, handler);

  removeListener = async (event: string, handler: Handler) => this.socket.removeListener(event, handler);

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
