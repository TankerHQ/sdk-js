import { expect } from '@tanker/test-utils';

import { random } from '../random';

describe('random', () => {
  [0, 16, 24, 32].forEach(size => {
    it(`generates a random buffer of length ${size}`, async () => {
      const result1 = random(size);
      const result2 = random(size);
      expect(result1).to.be.an.instanceof(Uint8Array).and.to.have.lengthOf(size);
      expect(result2).to.be.an.instanceof(Uint8Array).and.to.have.lengthOf(size);
      if (size !== 0)
        expect(result1).not.to.deep.equal(result2);
    });
  });
});
