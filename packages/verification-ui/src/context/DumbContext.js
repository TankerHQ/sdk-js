// @flow
import * as React from 'react';
import EventEmitter from 'events';
import { makeDumbReducer, type Reducer } from 'dumb-reducer';

declare var __DEVELOPMENT__: bool;
declare var module: { hot: bool };

export type Payload = { type: string };
export type Action = any => Payload;
export type BoundAction = any => void;
export type Actions = { [string]: Action };
export type BoundActions = { [string]: BoundAction };

const bindActionCreator = <T>(actionCreator: T => Payload, dispatch: Payload => void): { [string]: (T => void) } => (
  (...args) => dispatch(actionCreator(...args))
);
const bindActionCreators = <T: Actions>(actionCreators: T, dispatch: Payload => void): $ObjMap<T, <I>(I => Payload) => (I => void)> => (
  Object.keys(actionCreators).reduce((acc, key) => { acc[key] = bindActionCreator(actionCreators[key], dispatch); return acc; }, {})
);

class DumbContext<T: Object, U: BoundActions> extends EventEmitter {
  reducer: Reducer;
  state: T;
  actions: U;
  context: Object;

  constructor(prefix: string, initialState: T, actions: $ObjMap<U, <I>(I => void) => (I => Payload)>) {
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
