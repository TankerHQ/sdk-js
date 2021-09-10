import { $Values } from 'utility-types';
import { InternalError, PreconditionFailed } from '@tanker/errors';

export const statusDefs = [
  /* 0 */ { name: 'STOPPED' },
  /* 1 */ { name: 'READY' },
  /* 2 */ { name: 'IDENTITY_REGISTRATION_NEEDED' },
  /* 3 */ { name: 'IDENTITY_VERIFICATION_NEEDED' },
];

export const statuses: Record<string, number> = (() => {
  const h = {};
  statusDefs.forEach((def, index) => {
    h[def.name] = index;
  });
  return h;
})();

export type Status = $Values<typeof statuses>;

export function assertStatus(status: Status, expectedStatus: Status | Array<Status>, to: string) {
  if (typeof expectedStatus === 'number') {
    if (status === expectedStatus) return;

    const { name } = statusDefs[status];
    const { name: expectedName } = statusDefs[expectedStatus];
    const message = `Expected status ${expectedName} but got ${name} trying to ${to}.`;
    throw new PreconditionFailed(message);
  }

  if (Array.isArray(expectedStatus)) {
    if (expectedStatus.includes(status)) return;

    const { name } = statusDefs[status];
    const expectedNames = expectedStatus.map(es => statusDefs[es].name);
    const message = `Expected status in [${expectedNames.join(', ')}] but got ${name} trying to ${to}.`;
    throw new PreconditionFailed(message);
  }

  throw new InternalError('Assertion error: invalid expectedStatus type in assertStatus');
}
