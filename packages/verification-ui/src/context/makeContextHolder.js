// @flow
import { prefixActions } from 'dumb-reducer';

import DumbContext from './DumbContext';
import registerLogger from './logger';

declare var __DEVELOPMENT__: bool;
declare var module: { hot: bool };

export type State = $Exact<{
  verificationCode: string,
  sendAttempts: number,
  sendIsFetching: bool,
  sendError: ?Error,
  sendSuccess: bool,
  verifyIsFetching: bool,
  verifyError: ?Error,
  verifySuccess: bool,
}>;

export type BoundActions = $Exact<{
  setVerificationCode: Function,
  reset: () => void,
  sendStart: number => void,
  sendError: Error => void,
  sendSuccess: () => void,
  verifyStart: () => void,
  verifyError: Error => void,
  verifySuccess: () => void,
}>;

export type Context = $Exact<{ state: State, actions: BoundActions }>;

export type ContextHolder = DumbContext<State, BoundActions>;

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

function makeContextHolder(noLogs?: bool): ContextHolder {
  const contextHolder = new DumbContext<State, BoundActions>(prefix, initialState, actions);
  if (!noLogs && typeof __DEVELOPMENT__ !== 'undefined' && __DEVELOPMENT__ && module.hot)
    registerLogger(contextHolder);

  return contextHolder;
}

export default makeContextHolder;
