// @flow

import sinon from 'sinon';
import { Transform } from 'readable-stream';

import { expect } from './chai';
import { StreamAlreadyClosed, BrokenStream } from '../errors';
import PromiseWrapper from '../PromiseWrapper';
import BufferedTransformStream from '../DataProtection/BufferedTransformStream';


describe('BufferedTransformStream', () => {
  let buffer: Array<Uint8Array>;

  let thrownError;
  let callbacks;
  let throwingCallbacks;
  let transformArg;
  let passThroughStream;
  let sync;

  before(() => {
    const nextTick = (value) => new Promise((resolve, reject) => {
      const callback = value instanceof Error ? reject : resolve;
      return setTimeout(() => callback(value), 0);
    });
    callbacks = {
      onData: (data) => {
        buffer.push(data);
        return nextTick();
      },
      onEnd: () => nextTick(),
      onError: () => {}
    };

    thrownError = new Error('error thrown by throwingCallbacks');
    throwingCallbacks = {
      onData: () => nextTick(thrownError),
      onEnd: () => nextTick(thrownError),
      onError: (err) => {
        expect(err).to.equal(thrownError);
        if (sync)
          sync.resolve();
      }
    };

    transformArg = {
      transform: function transform(data, encoding, callback) {
        this.push(data);
        callback();
      }
    };

    sinon.spy(transformArg, 'transform');
  });

  beforeEach(() => {
    buffer = [];
    passThroughStream = new Transform(transformArg);
    transformArg.transform.resetHistory();
  });

  it('lets data flow from input through transform to output stream', async () => {
    const stream = new BufferedTransformStream(passThroughStream, callbacks, { inputSize: 10, outputSize: 10 });
    const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await stream.write(data);
    await stream.close();

    expect(transformArg.transform.callCount).to.equal(1);
    expect(transformArg.transform.firstCall.args[0]).to.deep.equal(data);
    expect(buffer.length).to.equal(1);
    expect(buffer[0]).to.deep.equal(data);
  });

  describe('Split Input', () => {
    [1, 5, 10].forEach((inputSize) => {
      it(`can split input in chunks of size: ${inputSize}`, async () => {
        const stream = new BufferedTransformStream(passThroughStream, callbacks, { inputSize, outputSize: 10 });

        const data = new Uint8Array(30);

        await stream.write(data);
        await stream.close();

        expect(transformArg.transform.callCount).to.equal(data.length / inputSize);
        for (let i = 0; i < transformArg.transform.callCount; ++i) {
          const call = transformArg.transform.getCall(i);
          const arg = call.args[0];
          expect(arg.length).to.equal(inputSize);
        }
      });
    });
  });

  describe('Split Output', () => {
    [1, 5, 10].forEach((outputSize) => {
      it(`can split output in chunks of size: ${outputSize}`, async () => {
        const stream = new BufferedTransformStream(passThroughStream, callbacks, { inputSize: 10, outputSize });

        const data = new Uint8Array(30);

        await stream.write(data);
        await stream.close();
        let i = 0;
        for (; i < buffer.length - 1; ++i) {
          expect(buffer[i].length).to.equal(outputSize);
        }
        const totalSize = i * outputSize + buffer[buffer.length - 1].length;
        expect(totalSize).to.be.equal(data.length);
      });
    });
  });

  describe('Errors', () => {
    afterEach(() => {
      sync = null;
    });
    it('throws StreamAlreadyClosed when calling close a second time', async () => {
      const stream = new BufferedTransformStream(passThroughStream, callbacks, { inputSize: 10, outputSize: 10 });

      const promise = stream.close();
      await expect(stream.close()).to.be.rejectedWith(StreamAlreadyClosed);
      await expect(promise).to.be.fulfilled;
    });

    it('throws StreamAlreadyClosed when calling write after close', async () => {
      const stream = new BufferedTransformStream(passThroughStream, callbacks, { inputSize: 10, outputSize: 10 });

      const promise = stream.close();
      await expect(stream.write(new Uint8Array(10))).to.be.rejectedWith(StreamAlreadyClosed);
      await expect(promise).to.be.fulfilled;
    });

    it('reports any error thrown by \'onData\' to \'onError\'', async () => {
      const stream = new BufferedTransformStream(passThroughStream, throwingCallbacks, { inputSize: 10, outputSize: 10 });
      const data = new Uint8Array(10);
      sync = new PromiseWrapper();

      await expect(stream.write(data)).to.be.fulfilled;
      await sync.promise;
    });

    it('reports any error thrown by \'onEnd\' to close', async () => {
      const stream = new BufferedTransformStream(passThroughStream, throwingCallbacks, { inputSize: 10, outputSize: 10 });
      await expect(stream.close()).to.be.rejectedWith(thrownError);
    });

    it('throws BrokenStream in every call after an error was reported to \'onError\'', async () => {
      const stream = new BufferedTransformStream(passThroughStream, throwingCallbacks, { inputSize: 10, outputSize: 10 });
      const data = new Uint8Array(10);
      sync = new PromiseWrapper();

      await expect(stream.write(data)).to.be.fulfilled;
      await sync.promise;
      await expect(stream.write(data)).to.be.rejectedWith(BrokenStream);
      await expect(stream.close()).to.be.rejectedWith(BrokenStream);
    });

    it('throws BrokenStream in close when flushing triggers an error', async () => {
      const stream = new BufferedTransformStream(passThroughStream, throwingCallbacks, { inputSize: 20, outputSize: 20 });
      const data = new Uint8Array(10);

      await expect(stream.write(data)).to.be.fulfilled;
      await expect(stream.close()).to.be.rejectedWith(BrokenStream);
    });
  });
});
