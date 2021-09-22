import { prefixActions } from 'dumb-reducer';

import DumbContext from './DumbContext';
import registerLogger from './logger';

declare let module: { hot: boolean; };

export type State = {
  verificationCode: string;
  sendAttempts: number;
  sendIsFetching: boolean;
  sendError: Error | null | undefined;
  sendSuccess: boolean;
  verifyIsFetching: boolean;
  verifyError: Error | null | undefined;
  verifySuccess: boolean;
};

export type BoundActions = {
  setVerificationCode: (verificationCode: string) => void;
  reset: () => void;
  sendStart: (sendAttempts: number) => void;
  sendError: (sendError: Error) => void;
  sendSuccess: () => void;
  verifyStart: () => void;
  verifyError: (verifyError: Error) => void;
  verifySuccess: () => void;
};

export type Context = { state: State; actions: BoundActions; };

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

function makeContextHolder(noLogs?: boolean): ContextHolder {
  const contextHolder = new DumbContext<State, BoundActions>(prefix, initialState, actions);
  if (!noLogs && process.env['NODE_ENV'] === 'development' && module.hot)
    registerLogger(contextHolder);

  return contextHolder;
}

export default makeContextHolder;
