// @flow
import { random } from '@tanker/crypto';
import { expect } from './chai';

import TrustchainPuller from '../Trustchain/TrustchainPuller';

import { makeBuffer } from './utils';

function makeMockClient() {
  return {
    _callbacks: { blockAvailable: [], started: [], invalid: [] },
    _send: async (/*event, payload*/) => { expect.fail(true, false, 'this method should have been called in the tests'); },
    emit: function emit(event) { this._callbacks[event].forEach(cb => cb()); },
    on: function on(event, cb) { this._callbacks[event].push(cb); },
    socket: true,
    trustchainId: random(32),
  };
}

function makeMockTrustchainStore() {
  return {
    lastBlockIndex: 0
  };
}

describe('TrustchainPuller', () => {
  let mockClient;
  let mockTrustchainStore;
  let tp;

  beforeEach(() => {
    mockClient = makeMockClient();
    mockTrustchainStore = makeMockTrustchainStore();
    // $FlowExpectedError
    tp = new TrustchainPuller(mockClient, new Uint8Array(0), mockTrustchainStore);
  });

  describe('client events', () => {
    it('should schedule a catchUp after proper client events', () => {
      let calls = 0;
      tp.scheduleCatchUp = async () => { calls += 1; };

      // expected events, should schedule
      mockClient.emit('blockAvailable');
      expect(calls).to.be.equal(1);
      mockClient.emit('blockAvailable');
      expect(calls).to.be.equal(2);

      // unexpected event, should not schedule
      mockClient.emit('invalid');
      expect(calls).to.be.equal(2);
    });
  });

  describe('catchUp scheduling and execution', () => {
    let calls;
    let running;
    let extraUsersPulled;

    beforeEach(() => {
      calls = 0;
      running = false;
      extraUsersPulled = [];
      // Mocking _catchUp for test purposes:
      //   - raise an exception if parallel runs detected
      //   - "run" for 100ms
      //   - counts the number of calls
      tp._catchUp = (extraUsers: ?Array<Uint8Array>) => { // eslint-disable-line no-underscore-dangle
        if (running) {
          expect.fail(true, false, 'a catchUp should not run if a previous one is still running');
        }

        if (extraUsers) {
          extraUsersPulled.push(...extraUsers);
        }
        calls += 1;
        running = true;
        return new Promise(resolve => setTimeout(() => {
          running = false;
          resolve();
        }, 100));
      };
    });

    it('should merge catchUps if previous ones not started yet', async () => {
      await Promise.all([
        tp.scheduleCatchUp(), // catchUp starts immediately
        tp.scheduleCatchUp(), // catchUp queued
        tp.scheduleCatchUp(), // catchUp merged with queued one
        tp.scheduleCatchUp(), // catchUp merged with queued one
      ]);

      expect(calls).to.be.equal(2);
    });

    it('should execute catchUps serially, not concurrently', async () => {
      await Promise.all([
        tp.scheduleCatchUp(),
        tp.scheduleCatchUp([makeBuffer('2', 1)]) // Using an extra user to force a second pull
      ]);

      expect(calls).to.be.equal(2);
    });

    it('should buffer extra users and pull them all', async () => {
      const userId1 = makeBuffer('1', 1);
      const userId2 = makeBuffer('2', 1);
      const userId3 = makeBuffer('3', 1);
      const userId4 = makeBuffer('4', 1);

      await Promise.all([
        tp.scheduleCatchUp(),
        tp.scheduleCatchUp([userId1]),
        tp.scheduleCatchUp([userId2]),
        tp.scheduleCatchUp([userId3]),
        tp.scheduleCatchUp([userId4]),
      ]);

      expect(calls).to.be.equal(2);
      expect(extraUsersPulled.length).to.equal(4);
    });
  });
});
