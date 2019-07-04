// @flow
import * as React from 'react';
import { makeDumbReducer, prefixActions } from 'dumb-reducer';

declare var __DEVELOPMENT__: bool;
declare var module: { hot: bool };

type Action = { type: string };
export type Context = $Exact<{
  verificationCode: string,
  sendAttempts: number,
  sendIsFetching: bool,
  sendError: ?Error,
  sendSuccess: bool,
  verifyIsFetching: bool,
  verifyError: ?Error,
  verifySuccess: bool,
  actions: $Exact<{
    setVerificationCode: Function,
    reset: () => void,
    sendStart: number => void,
    sendError: Error => void,
    sendSuccess: () => void,
    verifyStart: () => void,
    verifyError: Error => void,
    verifySuccess: () => void,
  }>,
}>;

const prefix = '@@tanker-verification-ui';
const initialState = {
  verificationCode: '',
  sendAttempts: 0,
  sendIsFetching: false,
  sendError: null,
  sendSuccess: false,
  verifyIsFetching: false,
  verifyError: null,
  verifySuccess: false,
};

const actions = prefixActions(
  prefix,
  {
    setVerificationCode: (verificationCode: string) => ({ verificationCode }),
    reset: () => initialState,
    sendStart: (sendAttempts: number) => ({ sendAttempts, sendIsFetching: true, sendError: null, sendSuccess: false, verifyError: null }),
    sendError: (sendError: Error) => ({ sendIsFetching: false, sendError }),
    sendSuccess: () => ({ sendIsFetching: false, sendSuccess: true, verifyError: null }),
    verifyStart: () => ({ verifyIsFetching: true, verifyError: null, verifySuccess: false, sendSuccess: false, sendError: null }),
    verifyError: (verifyError: Error) => ({ verificationCode: '', verifyIsFetching: false, verifyError, sendError: null, sendSuccess: false }),
    verifySuccess: () => ({ verifyIsFetching: false, verifySuccess: true }),
  },
);

const reducer = makeDumbReducer(prefix, initialState);

const bindActionCreator = <T>(actionCreator: T => Action, dispatch: Action => void): { [string]: (T => void) } => (
  (...args) => dispatch(actionCreator(...args))
);
const bindActionCreators = <T: { [string]: any => Action }>(actionCreators: T, dispatch: Action => void): $ObjMap<T, <I>(I => Action) => (I => void)> => (
  Object.keys(actionCreators).reduce((acc, key) => { acc[key] = bindActionCreator(actionCreators[key], dispatch); return acc; }, {})
);

class ContextHolder {
  context: Context;
  reactContext: Object;
  _onUpdate: () => void;

  constructor(onUpdate: () => void) {
    const initialContext = {
      ...initialState,
      actions: bindActionCreators(actions, this._dispatch),
    };
    this.context = initialContext;
    this.reactContext = React.createContext(initialContext);
    this._onUpdate = onUpdate;
  }

  _dispatch = (action: { type: string }) => {
    const shouldLog = typeof __DEVELOPMENT__ !== 'undefined' && __DEVELOPMENT__ && module.hot;

    try {
      if (shouldLog)
        console.groupCollapsed(`%caction %c${action.type}`, 'color: gray; font-weight: 400', 'color: inherit; font-weight: 700'); // eslint-disable-line no-console

      const prev = this.context;
      const next = reducer(this.context, action);
      this.context = next;
      this._onUpdate();

      if (shouldLog) {
        /* eslint-disable no-console */
        console.log('%cprev state', 'color: #9E9E9E; font-weight: 700', prev);
        console.log('%caction    ', 'color: #03A9F4; font-weight: 700', action);
        console.log('%cnext state', 'color: #4CAF50; font-weight: 700', next);
        /* eslint-enable no-console */
      }
    } catch (e) {
      if (shouldLog)
        console.log('%cerror     ', 'color: #F20404; font-weight: 700', e); // eslint-disable-line no-console

      throw e;
    } finally {
      if (shouldLog)
        console.groupEnd(); // eslint-disable-line no-console
    }
  };
}

export default ContextHolder;
