// @flow
import { expect } from '@tanker/test-utils';

import { zeroDelayGenerator } from '../delay';
import { retry } from '../retry';

describe('retry', () => {
  const error = new Error('Expected test error');
  const successfulAttempt = 2;

  let attempts = 0;

  const succeedAt = (attempt: number) => () => {
    attempts += 1;
    if (attempts < attempt) throw error;
    return 'success';
  };

  beforeEach(() => {
    attempts = 0;
  });

  [0, 1, 2, 3].forEach(retries => {
    if (successfulAttempt <= 1 + retries) {
      it(`can succeed at attempt ${successfulAttempt} with ${retries} retries`, async () => {
        const result = await retry(succeedAt(successfulAttempt), { retries, delayGenerator: zeroDelayGenerator });
        expect(attempts).to.equal(successfulAttempt);
        expect(result).to.equal('success');
      });
    } else {
      it(`fails to reach successful attempt ${successfulAttempt} with ${retries} retries`, async () => {
        await expect(retry(succeedAt(successfulAttempt), { retries, delayGenerator: zeroDelayGenerator })).to.be.rejectedWith(error);
        expect(attempts).to.equal(1 + retries);
      });
    }
  });
});
