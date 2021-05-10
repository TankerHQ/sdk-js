// @flow

// Note: we rely on core-js-pure ponyfills, and use them as polyfills
//       manually. This allows to reuse core-js-pure dependency from
//       @babel/transform-corejs3 without requiring core-js polyfills
//       additionally.
import Promise from 'core-js-pure/features/promise'; // eslint-disable-line import/no-extraneous-dependencies

// Promise polyfill required for Dexie 3 in IE11
if (!window.Promise) {
  window.Promise = Promise;
}
