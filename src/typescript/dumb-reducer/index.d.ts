declare module 'dumb-reducer' {
  export type Reducer = (state: Record<string, any>, payload: Record<string, any>) => Record<string, any>;
  export type SubReducers = Record<string, Reducer>;
  export function makeDumbReducer(prefix: string, initialState: Record<string, any> = {}, subReducers: SubReducers = {}): Reducer;
  export function prefixActions(prefix: string, actions: Record<string, any>): Record<string, any>; 
}