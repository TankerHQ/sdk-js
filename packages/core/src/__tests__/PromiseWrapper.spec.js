// @flow
import { expect } from '@tanker/test-utils';

import PromiseWrapper from '../PromiseWrapper';

const afterSomeTimeDo = (f: () => void): TimeoutID => setTimeout(f, 20);

describe('PromiseWrapper', () => {
  let value;
  let pw;

  beforeEach(() => {
    value = '<a value>';
    pw = new PromiseWrapper();
  });

  it('should resolve like a promise', async () => {
    afterSomeTimeDo(() => {
      // shouldn't be settled before resolution
      expect(pw.settled).to.be.false;
      pw.resolve(value);
    });

    const result = await pw.promise;
    expect(result).to.be.equal(value);

    // should be settled after resolution
    expect(pw.settled).to.be.true;
  });

  it('should resolve with any value type', async () => {
    for (value of [true, 10, 'string', ['an', 'array']]) {
      pw = new PromiseWrapper();
      pw.resolve(value);
      const result = await pw.promise;
      expect(result).to.be.equal(value);
      expect(pw.settled).to.be.true;
    }
  });

  it('should reject like a promise', async () => {
    const errorMsg = 'some error message';

    afterSomeTimeDo(() => {
      // shouldn't be settled before rejection
      expect(pw.settled).to.be.false;
      pw.reject(new Error(errorMsg));
    });

    await expect(pw.promise).to.be.rejectedWith(errorMsg);

    // should be settled after rejection
    expect(pw.settled).to.be.true;
  });
});
