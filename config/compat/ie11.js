// Note: we rely on core-js-pure ponyfills, and use them as polyfills
//       manually. This allows to reuse core-js-pure dependency from
//       @babel/transform-corejs3 without requiring core-js polyfills
//       additionally.
import Promise from 'core-js-pure/features/promise'; // eslint-disable-line import/no-extraneous-dependencies
import MathImul from 'core-js-pure/features/math/imul'; // eslint-disable-line import/no-extraneous-dependencies
import MAX_SAFE_INTEGER from 'core-js-pure/features/number/max-safe-integer'; // eslint-disable-line import/no-extraneous-dependencies

// Babel was polyfilling this automatically but we don't use Babel everytime anymore
import 'core-js/features/array/find'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/array/find-index'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/array/from'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/array/includes'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/array/values'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/map'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/assign'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/create'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/define-property'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/entries'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/freeze'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/get-own-property-descriptor'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/get-prototype-of'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/keys'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/set-prototype-of'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/object/values'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/symbol'; // eslint-disable-line import/no-extraneous-dependencies
import 'core-js/features/set'; // eslint-disable-line import/no-extraneous-dependencies

// Promise polyfill required for Dexie 3 and libsodium.js in IE11
if (!window.Promise || !window.Promise.prototype.finally) {
  window.Promise = Promise;
}

// Math.imul polyfill required for libsodium.js in IE11
if (!window.Math.imul) {
  window.Math.imul = MathImul;
}

// Babel was polyfilling this automatically but we don't use Babel everytime anymore
// required by @tanker/crypto
if (!Number.MAX_SAFE_INTEGER) {
  Number.MAX_SAFE_INTEGER = MAX_SAFE_INTEGER;
}
