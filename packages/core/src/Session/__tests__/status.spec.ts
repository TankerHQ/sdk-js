import { PreconditionFailed } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import { assertStatus, statusDefs, Status, statuses } from '../status';

describe('assertStatus', () => {
  let operation: string;
  let allStatuses: Array<Status>;

  before(() => {
    operation = 'an operation';
    allStatuses = Object.values(statuses);
  });

  it('does not throw if expected status', () => {
    statusDefs.forEach((_, status) => {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      expect(() => assertStatus(status, status, operation)).not.to.throw();
    });
  });

  it('throws a PreconditionFailed error if unexpected status', () => {
    statusDefs.forEach((def, status) => {
      const expectedStatus = (status + 1) % statusDefs.length; // next status
      const { name: expectedName } = statusDefs[expectedStatus]!;
      const { name } = def;
      const pattern = new RegExp(`${expectedName}.*${name}.*${operation}`);
      expect(
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        () => assertStatus(status, expectedStatus, operation),
      ).to.throw(PreconditionFailed, pattern);
    });
  });

  it('does not throw if status in the list', () => {
    statusDefs.forEach((_, status) => {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      expect(() => assertStatus(status, allStatuses, operation)).not.to.throw();
    });
  });

  it('throws a PreconditionFailed error if status not in the list', () => {
    statusDefs.forEach((def, status) => {
      const otherStatuses = allStatuses.filter((s) => s !== status);
      const { name } = def;
      const pattern = new RegExp(`${name}.*${operation}`);
      expect(
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        () => assertStatus(status, otherStatuses, operation),
      ).to.throw(PreconditionFailed, pattern);
    });
  });
});
