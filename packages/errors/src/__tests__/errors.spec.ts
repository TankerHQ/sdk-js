import { expect } from '@tanker/test-utils';

import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';
import { InvalidArgument } from '../errors/InvalidArgument';
import { OperationCanceled } from '../errors/OperationCanceled';

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

  it('can change its message', () => {
    const message = 'a specific error message';
    const newMessage = 'a new specific error message';
    const error = new TankerError('TankerError', message);
    error.setMessage(newMessage);
    expect(error.message).to.equal(newMessage);
  });

  it('should pretty print the error class and message if any', () => {
    let error;
    const name = 'SpecificError';
    const message = 'a specific error message';
    const newMessage = 'a new specific error message';

    error = new TankerError();
    expect(error.toString()).to.equal('[Tanker] TankerError');

    error = new TankerError(name);
    expect(error.toString()).to.equal(`[Tanker] ${name}`);

    error = new TankerError(name, message);
    expect(error.toString()).to.equal(`[Tanker] ${name}: ${message}`);

    error.setMessage(newMessage);
    expect(error.toString()).to.equal(`[Tanker] ${name}: ${newMessage}`);
  });

  describe('error info', () => {
    let apiCode: string;
    let apiMethod: string;
    let apiRoute: string;
    let message: string;
    let httpStatus: number;
    let traceId: string;

    let errorInfo: ErrorInfo;

    before(() => {
      apiCode = 'invalid_verification_code';
      apiMethod = 'POST';
      apiRoute = 'https://api.tanker.io/v2/apps/AAAA/users/BBBB/verification-methods';
      httpStatus = 401;
      message = 'Invalid verification code';
      traceId = '20e73fd692fc3151133e8fdeeda63a1e';

      errorInfo = { apiCode, apiMethod, apiRoute, httpStatus, message, traceId };
    });

    it('should have configurable error info', () => {
      const error = new TankerError('TankerError', errorInfo);
      expect(error.apiCode).to.equal(apiCode);
      expect(error.apiMethod).to.equal(apiMethod);
      expect(error.apiRoute).to.equal(apiRoute);
      expect(error._message).to.equal(message); // eslint-disable-line no-underscore-dangle
      expect(error.httpStatus).to.equal(httpStatus);
      expect(error.traceId).to.equal(traceId);
    });

    it('should pretty print the error class and error info if any', () => {
      const name = 'SpecificError';
      const error = new TankerError(name, errorInfo);
      const expectedMessage = `${message}, api_code: "${apiCode}", api_method: "${apiMethod}", api_route: "${apiRoute}", http_status: ${httpStatus}, trace_id: "${traceId}"`;
      expect(error.message).to.equal(expectedMessage);
      expect(error.toString()).to.equal(`[Tanker] ${name}: ${expectedMessage}`);
    });

    it('should set and pretty print partial error info', () => {
      const name = 'SpecificError';
      const partialErrorInfo = { message, traceId };
      const error = new TankerError(name, partialErrorInfo);
      const expectedMessage = `${message}, trace_id: "${traceId}"`;
      expect(error.apiCode).to.be.undefined;
      expect(error.apiMethod).to.be.undefined;
      expect(error.apiRoute).to.be.undefined;
      expect(error._message).to.equal(message); // eslint-disable-line no-underscore-dangle
      expect(error.httpStatus).to.be.undefined;
      expect(error.traceId).to.equal(traceId);
      expect(error.message).to.equal(expectedMessage);
      expect(error.toString()).to.equal(`[Tanker] ${name}: ${expectedMessage}`);
    });

    describe('OperationCanceled', () => {
      let reason: Error;

      before(() => {
        reason = new Error('specific next error');
      });

      it('doest not print reason if not given', () => {
        const error = new OperationCanceled(undefined, undefined);
        expect(error.reason).to.deep.eq(undefined);
        const expectedMessage = 'Operation canceled';

        expect(error.message).to.eq(expectedMessage);
        expect(error.toString()).to.equal(`[Tanker] OperationCanceled: ${expectedMessage}`);
      });

      it('pretty prints the error class and reason if any', () => {
        const error = new OperationCanceled(undefined, reason);
        expect(error.reason).to.deep.eq(reason);
        const expectedMessage = `Operation canceled. Cancelation reason: ${reason}`;

        expect(error.message).to.eq(expectedMessage);
        expect(error.toString()).to.equal(`[Tanker] OperationCanceled: ${expectedMessage}`);
      });

      it('pretty prints the error class, error info and reason if any', () => {
        const error = new OperationCanceled(errorInfo, reason);
        expect(error.reason).to.deep.eq(reason);
        const expectedMessage = `${message}, api_code: "${apiCode}", api_method: "${apiMethod}", api_route: "${apiRoute}", http_status: ${httpStatus}, trace_id: "${traceId}". Cancelation reason: ${reason}`;

        expect(error.message).to.eq(expectedMessage);
        expect(error.toString()).to.equal(`[Tanker] OperationCanceled: ${expectedMessage}`);
      });
    });
  });

  describe('subclasses', () => {
    let error: Error;
    let message: string;

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
