// @flow
import { expect } from '@tanker/test-utils';

import { exponentialDelayGenerator } from '../delay';

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
