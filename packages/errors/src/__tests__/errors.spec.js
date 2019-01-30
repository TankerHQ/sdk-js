// @flow
import { expect } from 'chai';

import TankerError from '../TankerError';
import InvalidArgument from '../errors/InvalidArgument';

const nature = 'invalid_argument';

describe('TankerError', () => {
  it('should handle nature and instanceof correctly', () => {
    const tankerError = new TankerError(nature);
    expect(tankerError.nature).to.equal(nature);
    expect(tankerError instanceof TankerError).to.be.true;
    expect(tankerError instanceof Error).to.be.true;
  });

  it('should handle nature and instanceof correctly when inherited', () => {
    const subclassError = new InvalidArgument('some argument', 'any', null);
    expect(subclassError.nature).to.equal(nature);
    expect(subclassError instanceof InvalidArgument).to.be.true;
    expect(subclassError instanceof TankerError).to.be.true;
    expect(subclassError instanceof Error).to.be.true;
  });
});
