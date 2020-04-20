// @flow
import Socket from 'socket.io-client'; // eslint-disable-line import/no-extraneous-dependencies

import { tankerUrl, idToken } from './config';

const query = { type: 'admin', context: 'js-functional-tests' };
const socket = new Socket(tankerUrl, { transports: ['websocket', 'polling'], query });

async function send(eventName: string, message: Object | string) {
  const jdata = eventName !== 'push block' ? JSON.stringify(message) : message;
  return new Promise((resolve, reject) => {
    socket.emit(
      eventName, jdata,
      jresult => {
        try {
          const result = JSON.parse(jresult);
          if (result && result.error) {
            reject(new Error(result.error.code));
          } else {
            resolve(result);
          }
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

export class AuthenticatedRequester {
  _reopenPromise: ?Promise<*>;
  _tries: number = 0;

  static open = async () => {
    await send('authenticate customer', { idToken });
    return new AuthenticatedRequester();
  }

  _reopenSession = async () => {
    if (!this._reopenPromise) {
      this._reopenPromise = send('authenticate customer', { idToken });
      await this._reopenPromise;
      this._reopenPromise = null;
    } else {
      await this._reopenPromise;
    }
  }

  send = async (eventName: string, data: ?Object = null): Promise<*> => {
    let ret;
    try {
      ret = await send(eventName, data);
    } catch (e) {
      if (this._tries > 5 || e.message !== 'no_session') {
        throw e;
      }
      this._tries += 1;
      await this._reopenSession();
      return this.send(eventName, data);
    }
    this._tries = 0;
    return ret;
  }
}
