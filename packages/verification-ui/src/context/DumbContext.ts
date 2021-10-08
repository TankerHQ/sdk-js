import * as React from 'react';
import EventEmitter from 'events';
import type { Reducer } from 'dumb-reducer';
import { makeDumbReducer } from 'dumb-reducer';

export type Payload = { type: string; };
export type Action = (...args: any[]) => Payload;
export type BoundAction = (...args: any[]) => void;
export type Actions = Record<string, Action>;
export type BoundActions = Record<string, BoundAction>;

const bindActionCreator = (actionCreator: Action, dispatch: (payload: Payload) => void): BoundAction => (
  (...args: any[]) => dispatch(actionCreator(...args))
);
const bindActionCreators = <T extends Actions>(actionCreators: T, dispatch: (payload: Payload) => void): BoundActions => (
  Object.keys(actionCreators).reduce((acc: BoundActions, key: string) => { acc[key] = bindActionCreator(actionCreators[key]!, dispatch); return acc; }, {})
);

export class DumbContext<T extends Record<string, any>, U extends BoundActions> extends EventEmitter {
  actions: U;
  context: React.Context<{ state: T; actions: U }>; // eslint-disable-line react/static-property-placement
  reducer: Reducer;
  state: T;

  constructor(prefix: string, initialState: T, actions: Actions) {
    super();

    this.reducer = makeDumbReducer(prefix, initialState);
    this.state = initialState;
    this.actions = bindActionCreators<typeof actions>(actions, this._dispatch) as U;
    this.context = React.createContext<{ state: T; actions: U }>({ state: this.state, actions: this.actions });
  }

  _dispatch = (payload: Payload) => {
    const prev = this.state;

    try {
      const next = this.reducer(prev, payload) as T;
      this.state = next;
      this.emit('update', prev, payload, next);
    } catch (error) {
      this.emit('error', prev, payload, error);
      throw error;
    }
  };
}

export default DumbContext;
