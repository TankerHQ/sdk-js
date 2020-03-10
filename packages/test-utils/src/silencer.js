// @flow
import sinon from 'sinon';

export const silencer = {
  _stubs: [],
  silence: function silence(funcName: string, regexp: RegExp = /./) {
    const originalFunc = console[funcName].bind(console); // eslint-disable-line no-console
    const silencedFunc = (...funcArgs) => !(funcArgs[0].toString() || '').match(regexp) && originalFunc(...funcArgs);
    const stub = sinon.stub(console, funcName).callsFake(silencedFunc);
    this._stubs.push(stub);
    return stub;
  },
  restore: function restore() {
    this._stubs.forEach(stub => stub.restore());
    this._stubs = [];
  }
};
