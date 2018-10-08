// @flow
import { random } from '@tanker/crypto';
import { expect } from './chai';

import TrustchainPuller from '../Trustchain/TrustchainPuller';

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
    tp = new TrustchainPuller(mockClient, mockTrustchainStore);
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

    beforeEach(() => {
      calls = 0;
      running = false;

      // Mocking _catchUp for test purposes:
      //   - raise an exception if parallel runs detected
      //   - "run" for 100ms
      //   - counts the number of calls
      tp._catchUp = () => { // eslint-disable-line no-underscore-dangle
        if (running) {
          expect.fail(true, false, 'a catchUp should not run if a previous one is still running');
        }

        calls += 1;
        running = true;

        return new Promise(resolve => setTimeout(() => {
          running = false;
          resolve();
        }, 100));
      };
    });

    it('should ignore a second catchUp if first one not started yet', async () => {
      await Promise.all([
        tp.scheduleCatchUp([]),
        tp.scheduleCatchUp([]) // should be ignored
      ]);

      expect(calls).to.be.equal(1);
    });

    it('should execute catchUps serially, not concurrently', async () => {
      await Promise.all([
        tp.scheduleCatchUp([]),
        // Trick to wait for the first catchUp to start, so the second
        // one is scheduled
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 0));
          return tp.scheduleCatchUp([]);
        })()
      ]);

      expect(calls).to.be.equal(2);
    });
  });
});
