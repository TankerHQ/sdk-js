// @flow
import sinon from 'sinon';

export const warnings = {
  _handle: null,
  silence: function silence(regexp: RegExp = /./) {
    if (this._handle) return;
    const warn = console.warn.bind(console);
    const silencedWarn = (...warnArgs) => !(warnArgs[0].toString() || '').match(regexp) && warn(...warnArgs);
    this._handle = sinon.stub(console, 'warn').callsFake(silencedWarn);
  },
  restore: function restore() { if (this._handle) { this._handle.restore(); this._handle = null; } }
};
