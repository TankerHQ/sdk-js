// @flow
import { PreconditionFailed } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { assertStatus, statusDefs, statuses, type Status } from '../status';

describe('assertStatus', () => {
  let operation;
  let allStatuses;

  before(() => {
    operation = 'an operation';
    allStatuses = ((Object.values(statuses): any): Array<Status>);
  });

  it('does not throw if expected status', () => {
    statusDefs.forEach((def, status) => {
      expect(() => assertStatus(status, status, operation)).not.to.throw();
    });
  });

  it('throws a PreconditionFailed error if unexpected status', () => {
    statusDefs.forEach((def, status) => {
      const expectedStatus = (status + 1) % statusDefs.length; // next status
      const { name: expectedName } = statusDefs[expectedStatus];
      const { name } = def;
      expect(
        () => assertStatus(status, expectedStatus, operation)
      ).to.throw(PreconditionFailed, expectedName, name, operation);
    });
  });

  it('does not throw if status in the list', () => {
    statusDefs.forEach((def, status) => {
      expect(() => assertStatus(status, allStatuses, operation)).not.to.throw();
    });
  });

  it('throws a PreconditionFailed error if status not in the list', () => {
    statusDefs.forEach((def, status) => {
      const otherStatuses = allStatuses.filter((s) => s !== status);
      const { name } = def;
      expect(
        () => assertStatus(status, otherStatuses, operation)
      ).to.throw(PreconditionFailed, name, operation);
    });
  });
});
