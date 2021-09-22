import type { DumbContext, Payload } from './DumbContext';

/* eslint-disable no-console */
const openGroup = (action: Payload) => console.groupCollapsed(`%caction %c${action.type}`, 'color: gray; font-weight: 400', 'color: inherit; font-weight: 700');
const logPrev = (prev: Payload) => console.log('%cprev state', 'color: #9E9E9E; font-weight: 700', prev);
const logAction = (action: Payload) => console.log('%caction    ', 'color: #03A9F4; font-weight: 700', action);

function logUpdate(prev: Payload, action: Payload, next: Payload) {
  openGroup(action);
  logPrev(prev);
  logAction(action);
  console.log('%cnext state', 'color: #4CAF50; font-weight: 700', next);
  console.groupEnd();
}

function logError(prev: Payload, action: Payload, error: Payload) {
  openGroup(action);
  logPrev(prev);
  logAction(action);
  console.log('%cerror     ', 'color: #F20404; font-weight: 700', error);
  console.groupEnd();
}

function registerLogger(contextHolder: DumbContext<any, any>) {
  contextHolder.on('update', logUpdate);
  contextHolder.on('error', logError);
}

export default registerLogger;
