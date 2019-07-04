// @flow
import DumbContext from './DumbContext';

/* eslint-disable no-console */
const openGroup = action => console.groupCollapsed(`%caction %c${action.type}`, 'color: gray; font-weight: 400', 'color: inherit; font-weight: 700');
const logPrev = prev => console.log('%cprev state', 'color: #9E9E9E; font-weight: 700', prev);
const logAction = action => console.log('%caction    ', 'color: #03A9F4; font-weight: 700', action);

function logUpdate(prev, action, next) {
  openGroup(action);
  logPrev(prev);
  logAction(action);
  console.log('%cnext state', 'color: #4CAF50; font-weight: 700', next);
  console.groupEnd();
}

function logError(prev, action, error) {
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
