import { expect } from '@tanker/test-utils';
import { InternalError } from '@tanker/errors';

import { preferredNature, natureKind, NATURE, NATURE_KIND } from '../Nature';
import type { Nature, NatureKind } from '../Nature';

describe('blocks: natures', () => {
  // Extract minimum and maximum object values (without Flow issues...)
  const minMax = <T extends number>(obj: Record<string, T>): [T, T] => {
    const values = ((Object.values(obj) as any) as Array<T>);
    let min = values.shift();
    let max = min;
    values.forEach(value => {
      if (value < min) min = value;
      if (value > max) max = value;
    });
    return [min, max];
  };

  describe('natureKind', () => {
    it('should map each nature into its kind', () => {
      for (const natureName of Object.keys(NATURE)) {
        // Check that <nature> matches /^<kind>(_v<version>)?$/
        const expectedKindName = natureName.replace(/_v\d+$/, '');
        const nature = NATURE[natureName];
        const kind = natureKind(nature);
        expect(NATURE_KIND[expectedKindName]).to.equal(kind);
      }
    });

    it('should throw InternalError if unknown nature given', () => {
      const [min, max] = minMax<Nature>(NATURE);
      const invalidNatures = [undefined, null, min - 1, max + 1];
      for (const invalidNature of invalidNatures) {
        // $FlowExpectedError invalid argument for test purposes
        expect(() => natureKind(invalidNature)).to.throw(InternalError);
      }
    });
  });

  describe('preferredNature', () => {
    it('should map each kind into a preferred nature of the same kind', () => {
      for (const kind of ((Object.values(NATURE_KIND) as any) as Array<NatureKind>)) {
        const nature = preferredNature(kind);
        expect(natureKind(nature)).to.equal(kind);
      }
    });

    it('should throw InternalError if unknown kind given', () => {
      const [min, max] = minMax<NatureKind>(NATURE_KIND);
      const invalidKinds = [undefined, null, min - 1, max + 1];
      for (const invalidKind of invalidKinds) {
        // $FlowExpectedError invalid argument for test purposes
        expect(() => preferredNature(invalidKind)).to.throw(InternalError);
      }
    });
  });
});
