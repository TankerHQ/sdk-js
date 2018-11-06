// @flow

import EventEmitter from 'events';
import sinon from 'sinon';

import { expect } from './chai';

import SynchronizedEventEmitter from '../SynchronizedEventEmitter';

// it is impossible to check the state of a promise, so we need this primitive
function myYield() {
  return new Promise((res) => setTimeout(res, 0));
}

describe('SynchronizedEventEmitter', () => {
  let eventEmitter;
  let sEventEmitter;

  beforeEach(async () => {
    eventEmitter = new EventEmitter();
    sEventEmitter = new SynchronizedEventEmitter(eventEmitter);
  });

  it('should trigger the callback when event is emitted', async () => {
    const spy = sinon.spy();
    sEventEmitter.on('event', spy);
    eventEmitter.emit('event');
    expect(spy.calledOnce).to.be.true;
    eventEmitter.emit('event');
    expect(spy.calledTwice).to.be.true;
  });

  it('should trigger the callback once if asked to', async () => {
    const spy = sinon.spy();
    sEventEmitter.once('event', spy);
    eventEmitter.emit('event');
    eventEmitter.emit('event');
    expect(spy.calledOnce).to.be.true;
  });

  it('should trigger the callback with arguments when event is emitted', async () => {
    let ok = false;
    sEventEmitter.on('event', (a, b, c) => {
      if (a === 1 && b === 2 && c === 3)
        ok = true;
    });
    eventEmitter.emit('event', 1, 2, 3);
    expect(ok).to.equal(true);
  });

  it('should not trigger the callback when event is emitted after disconnection', async () => {
    let called = false;
    const id = sEventEmitter.on('event', () => { called = true; });
    await sEventEmitter.removeListener(id);
    eventEmitter.emit('event');
    expect(called).to.equal(false);
  });

  it('should wait for all callbacks to finish before disconnecting', async () => {
    let promResolve;
    const prom = new Promise((res) => { promResolve = res; });
    const id = sEventEmitter.on('event', () => prom);
    eventEmitter.emit('event');

    let offDone = false;
    sEventEmitter.removeListener(id).then(() => { offDone = true; });
    await myYield();
    expect(offDone).to.equal(false);

    // unblock the callback
    if (!promResolve)
      throw new Error('Oups');
    promResolve();

    await myYield();

    expect(offDone).to.equal(true);
  });

  it('should not run any more callbacks when disconnecting', async () => {
    let promResolve;
    let callCount = 0;
    const prom = new Promise((res) => { promResolve = res; });
    const id = sEventEmitter.on('event', () => { callCount += 1; return prom; });
    eventEmitter.emit('event');

    const offProm = sEventEmitter.removeListener(id);

    eventEmitter.emit('event');

    if (!promResolve)
      throw new Error('Oups');
    promResolve();

    await offProm;

    expect(callCount).to.equal(1);
  });
});
