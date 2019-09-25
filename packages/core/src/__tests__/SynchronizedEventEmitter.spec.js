// @flow
import EventEmitter from 'events';
import { expect, sinon } from '@tanker/test-utils';

import PromiseWrapper from '../PromiseWrapper';
import SynchronizedEventEmitter from '../SynchronizedEventEmitter';

describe('SynchronizedEventEmitter', () => {
  let source;
  let synchronizedEmitter;

  beforeEach(() => {
    source = new EventEmitter();
    synchronizedEmitter = new SynchronizedEventEmitter(source);
  });

  context('emitting an event', () => {
    it('should trigger only matching event listeners', () => {
      const spy1 = sinon.spy();
      const spy2 = sinon.spy();
      const spy3 = sinon.spy();

      synchronizedEmitter.on('first', spy1);
      synchronizedEmitter.on('first', spy2);
      synchronizedEmitter.on('second', spy3);

      source.emit('first');
      expect(spy1.calledOnce).to.be.true;
      expect(spy2.calledOnce).to.be.true;
      expect(spy3.called).to.be.false;

      source.emit('first');
      expect(spy1.calledTwice).to.be.true;
      expect(spy2.calledTwice).to.be.true;
      expect(spy3.called).to.be.false;

      source.emit('third');
      expect(spy1.calledTwice).to.be.true;
      expect(spy2.calledTwice).to.be.true;
      expect(spy3.called).to.be.false;
    });

    it('should forward extra arguments to the listeners', () => {
      const spy = sinon.spy();
      synchronizedEmitter.on('event', spy);
      source.emit('event', 1, 2, 3);
      expect(spy.calledOnce).to.be.true;
      expect(spy.firstCall.args).to.deep.equal([1, 2, 3]);
    });

    it('should trigger the listener only once if asked to', async () => {
      const spy = sinon.spy();
      synchronizedEmitter.once('event', spy);
      source.emit('event');
      source.emit('event');
      expect(spy.calledOnce).to.be.true;
    });
  });

  context('removing an event listener', () => {
    let registeredCalls;

    const registerCalls = (event: string) => () => {
      const pw = new PromiseWrapper();
      if (!registeredCalls[event]) { registeredCalls[event] = []; }
      registeredCalls[event].push(pw);
      return pw.promise;
    };

    const expectPending = (promise: Promise<any>, milliseconds: number) => Promise.race([
      promise.finally(() => { expect.fail('Expected promise to be pending but was settled'); }),
      new Promise((res) => setTimeout(res, milliseconds))
    ]);

    beforeEach(() => {
      registeredCalls = {};
    });

    it('should wait for calls to this listener to complete before resolving', async () => {
      const id = synchronizedEmitter.on('event', registerCalls('event'));

      // This "unresolved" call should not block the removal of the 'event' listener
      synchronizedEmitter.on('other', registerCalls('other'));
      source.emit('other');
      expect(registeredCalls.other).to.have.lengthOf(1);

      source.emit('event');
      source.emit('event');
      expect(registeredCalls.event).to.have.lengthOf(2);

      const removePromise = synchronizedEmitter.removeListener(id);
      await expectPending(removePromise, 10);

      // Unblock calls to 'event' listener one by one
      registeredCalls.event[0].resolve();
      await expectPending(removePromise, 10);

      registeredCalls.event[1].resolve();
      await expect(removePromise).to.be.fulfilled;

      // Resolve the remaining blocking listener to avoid unhandled promises
      registeredCalls.other[0].resolve();
    });

    it('should prevent the listener to be called during or after its removal', async () => {
      const id = synchronizedEmitter.on('event', registerCalls('event'));

      // Trigger call
      source.emit('event');
      expect(registeredCalls.event).to.have.lengthOf(1);

      // Start removing listener
      const removePromise = synchronizedEmitter.removeListener(id);

      // Silently drop call while removing
      source.emit('event');
      expect(registeredCalls.event).to.still.have.lengthOf(1);

      // Unblock listener and wait for complete removal
      registeredCalls.event[0].resolve();
      await expect(removePromise).to.be.fulfilled;

      // Silently drop call after removal
      source.emit('event');
      expect(registeredCalls.event).to.still.have.lengthOf(1);
    });
  });
});
