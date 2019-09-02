// @flow
import { expect } from '@tanker/test-utils';

import { exponentialDelayGenerator, noDelayGenerator, retry } from '../retry';

describe('exponential delay generator', () => {
  [1, 3, 5].forEach((retries) => {
    it(`can generate a ${retries}-long list of delays increasing exponentially`, async () => {
      const generator = exponentialDelayGenerator(retries);

      let attempts = 0;

      while (attempts < retries) {
        const { value, done } = generator.next();
        const baseDelay = (2 ** attempts) * 1000;
        expect(value).to.be.within(baseDelay, baseDelay + 1000);
        expect(done).to.be.false;
        attempts += 1;
      }

      const { value, done } = generator.next();
      expect(value).to.be.undefined;
      expect(done).to.equal(true);
    });
  });
});

describe('retry', () => {
  const error = new Error('Expected test error');
  const successfulAttempt = 2;

  let called = 0;

  const succeedAt = (attempt: number) => () => {
    called += 1;
    if (called < attempt) throw error;
    return 'success';
  };

  beforeEach(() => {
    called = 0;
  });

  [0, 1, 2, 3].forEach(retries => {
    if (successfulAttempt <= 1 + retries) {
      it(`can succeed at attempt ${successfulAttempt} with ${retries} retries`, async () => {
        const result = await retry(succeedAt(successfulAttempt), { retries, delayGenerator: noDelayGenerator });
        expect(called).to.equal(successfulAttempt);
        expect(result).to.equal('success');
      });
    } else {
      it(`fails to reach successful attempt ${successfulAttempt} with ${retries} retries`, async () => {
        await expect(retry(succeedAt(successfulAttempt), { retries, delayGenerator: noDelayGenerator })).to.be.rejectedWith(error);
        expect(called).to.equal(1 + retries);
      });
    }
  });
});
