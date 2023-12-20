import { getGlobalThis } from './global-this';

const myGlobalThis: typeof globalThis = getGlobalThis();

export { myGlobalThis as globalThis };
