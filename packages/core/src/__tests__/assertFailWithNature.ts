import { expect } from '@tanker/test-utils';

import { InvalidBlockError } from '../errors.internal';

export function assertFailWithNature(verifyFunc: () => void, nature: string) {
  expect(verifyFunc)
    .to.throw(InvalidBlockError)
    .that.has.property('nature', nature);
}
