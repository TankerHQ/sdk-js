export type Class<T> = new (...args: any[]) => T;
export type PropType<TObj, TProp extends keyof TObj> = TObj[TProp];
