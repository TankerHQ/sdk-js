import { expect } from '@tanker/test-utils';

import { zeroDelayGenerator } from '../delay';
import { retry } from '../retry';

describe('retry', () => {
  const error = new Error('Expected test error');
  const successfulAttempt = 2;

  let attempts;

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

  describe('with retry condition', () => {
    const genericTests = conditions => {
      const { alwaysPass, alwaysBlock, blockAfterAttempts } = conditions;

      it('retries if retry condition is met', async () => {
        const retries = 2;
        const baseOpts = { retries, delayGenerator: zeroDelayGenerator };

        await expect(retry(succeedAt(retries), { ...baseOpts, retryCondition: alwaysPass })).to.be.fulfilled;
        expect(attempts).to.equal(2);
      });

      it('does not retry if retry condition is not met', async () => {
        const retries = 2;
        const baseOpts = { retries, delayGenerator: zeroDelayGenerator };

        await expect(retry(succeedAt(retries), { ...baseOpts, retryCondition: alwaysBlock })).to.be.rejected;
        expect(attempts).to.equal(1);
      });

      it('stop retrying if retry condition stops being met', async () => {
        const retries = 3;
        const baseOpts = { retries, delayGenerator: zeroDelayGenerator };

        await expect(retry(succeedAt(retries), { ...baseOpts, retryCondition: blockAfterAttempts(2) })).to.be.rejected;
        expect(attempts).to.equal(2);
      });
    };

    describe('synchronous condition', () => {
      genericTests({
        alwaysPass: () => true,
        alwaysBlock: () => false,
        blockAfterAttempts: count => {
          let calls = 0;
          return () => {
            calls += 1;
            return calls < count;
          };
        },
      });
    });

    describe('asynchronous condition', () => {
      genericTests({
        alwaysPass: async () => true,
        alwaysBlock: async () => false,
        blockAfterAttempts: count => {
          let calls = 0;
          return async () => {
            calls += 1;
            return calls < count;
          };
        },
      });
    });
  });
});
