// @flow
import { expect } from '@tanker/test-utils';

import { TankerError } from '../TankerError';
import { InvalidArgument } from '../errors/InvalidArgument';

describe('TankerError', () => {
  it('should be type testable with instanceof', () => {
    const error = new TankerError();
    expect(error instanceof TankerError).to.be.true;
    expect(error instanceof Error).to.be.true;
  });

  it('should have a default name', () => {
    const error = new TankerError();
    expect(error.name).to.equal('TankerError');
  });

  it('should have a configurable name', () => {
    const error = new TankerError('AnotherError');
    expect(error.name).to.equal('AnotherError');
  });

  it('should have a configurable message', () => {
    const message = 'a specific error message';
    const error = new TankerError('TankerError', message);
    expect(error.message).to.equal(message);
  });

  it('should pretty print the error class and message if any', () => {
    let error;
    const name = 'SpecificError';
    const message = 'a specific error message';

    error = new TankerError();
    expect(error.toString()).to.equal('[Tanker] TankerError');

    error = new TankerError(name);
    expect(error.toString()).to.equal(`[Tanker] ${name}`);

    error = new TankerError(name, message);
    expect(error.toString()).to.equal(`[Tanker] ${name}: ${message}`);
  });

  describe('subclasses', () => {
    let error;
    let message;

    before(() => {
      error = new InvalidArgument('size', 'number', null);
      message = 'name: size (number), value: null (null)';
    });

    it('should be type testable with instanceof', () => {
      expect(error instanceof InvalidArgument).to.be.true;
      expect(error instanceof TankerError).to.be.true;
      expect(error instanceof Error).to.be.true;
    });

    it('should have a name', () => {
      expect(error.name).to.equal('InvalidArgument');
    });

    it('should have a message', () => {
      expect(error.message).to.equal(message);
    });

    it('should pretty print the error class and message', () => {
      expect(error.toString()).to.equal(`[Tanker] InvalidArgument: ${message}`);
    });
  });
});
