// @flow
import sinon from 'sinon';

export const silencer = {
  _stubs: [],
  silence: function silence(funcName: string, regexp: RegExp = /./) {
    const originalFunc = console[funcName].bind(console); // eslint-disable-line no-console
    const silencedFunc = (...funcArgs) => !(funcArgs[0].toString() || '').match(regexp) && originalFunc(...funcArgs);
    this._stubs.push(sinon.stub(console, funcName).callsFake(silencedFunc));
  },
  restore: function restore() {
    this._stubs.forEach(stub => stub.restore());
    this._stubs = [];
  }
};
