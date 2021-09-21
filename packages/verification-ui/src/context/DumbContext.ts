import * as React from 'react';
import EventEmitter from 'events';
import type { Reducer } from 'dumb-reducer';
import { makeDumbReducer } from 'dumb-reducer';

export type Payload = { type: string; };
export type Action = (arg0: any) => Payload;
export type BoundAction = (arg0: any) => void;
export type Actions = Record<string, Action>;
export type BoundActions = Record<string, BoundAction>;

const bindActionCreator = <T>(actionCreator: (arg0: T) => Payload, dispatch: (arg0: Payload) => void): Record<string, (arg0: T) => void> => (
  (...args) => dispatch(actionCreator(...args))
);
const bindActionCreators = <T extends Actions>(actionCreators: T, dispatch: (arg0: Payload) => void): $ObjMap<T, <I>(arg0: (arg0: I) => Payload) => (arg0: I) => void> => (
  Object.keys(actionCreators).reduce((acc, key) => { acc[key] = bindActionCreator(actionCreators[key], dispatch); return acc; }, {})
);

class DumbContext<T extends Record<string, any>, U extends BoundActions> extends EventEmitter {
  actions: U;
  context: Record<string, any>;
  reducer: Reducer;
  state: T;

  constructor(prefix: string, initialState: T, actions: $ObjMap<U, <I>(arg0: (arg0: I) => void) => (arg0: I) => Payload>) {
    super();

    this.reducer = makeDumbReducer(prefix, initialState);
    this.state = initialState;
    this.actions = bindActionCreators(actions, this._dispatch);
    this.context = React.createContext({ state: this.state, actions: this.actions });
  }

  _dispatch = (payload: Payload) => {
    const prev = this.state;

    try {
      const next = this.reducer(prev, payload);
      this.state = next;
      this.emit('update', prev, payload, next);
    } catch (error) {
      this.emit('error', prev, payload, error);
      throw error;
    }
  };
}

export default DumbContext;
