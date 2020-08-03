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

  describe('error info', () => {
    let apiCode;
    let apiRoute;
    let message;
    let httpStatus;
    let traceId;

    let errorInfo;

    before(() => {
      apiCode = 'invalid_verification_code';
      apiRoute = 'set verification method';
      httpStatus = 401;
      message = 'Invalid verification code';
      traceId = '20e73fd692fc3151133e8fdeeda63a1e';

      errorInfo = { apiCode, apiRoute, httpStatus, message, traceId };
    });

    it('should have configurable error info', () => {
      const error = new TankerError('TankerError', errorInfo);
      expect(error.apiCode).to.equal(apiCode);
      expect(error.apiRoute).to.equal(apiRoute);
      expect(error._message).to.equal(message); // eslint-disable-line no-underscore-dangle
      expect(error.httpStatus).to.equal(httpStatus);
      expect(error.traceId).to.equal(traceId);
    });

    it('should pretty print the error class and error info if any', () => {
      const name = 'SpecificError';
      const error = new TankerError(name, errorInfo);
      const expectedMessage = `${message}, api_code: "${apiCode}", api_route: "${apiRoute}", http_status: ${httpStatus}, trace_id: "${traceId}"`;
      expect(error.message).to.equal(expectedMessage);
      expect(error.toString()).to.equal(`[Tanker] ${name}: ${expectedMessage}`);
    });

    it('should set and pretty print partial error info', () => {
      const name = 'SpecificError';
      const partialErrorInfo = { message, traceId };
      const error = new TankerError(name, partialErrorInfo);
      const expectedMessage = `${message}, trace_id: "${traceId}"`;
      expect(error.apiCode).to.be.undefined;
      expect(error.apiRoute).to.be.undefined;
      expect(error._message).to.equal(message); // eslint-disable-line no-underscore-dangle
      expect(error.httpStatus).to.be.undefined;
      expect(error.traceId).to.equal(traceId);
      expect(error.message).to.equal(expectedMessage);
      expect(error.toString()).to.equal(`[Tanker] ${name}: ${expectedMessage}`);
    });
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
