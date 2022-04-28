import { expect } from '@tanker/test-utils';

import * as padding from '../padding';

describe('Padding', () => {
  describe('padme', () => {
    it('returns the right values', () => {
      expect(padding.padme(0)).to.equal(0);
      expect(padding.padme(1)).to.equal(0);

      expect(padding.padme(2)).to.equal(2);
      expect(padding.padme(9)).to.equal(10);
      expect(padding.padme(42)).to.equal(44);
      expect(padding.padme(666)).to.equal(672);
      expect(padding.padme(1999)).to.equal(2048);
    });
  });

  describe('padClearData', () => {
    it('pads to the right size', () => {
      expect(padding.paddedFromClearSize(0, padding.Padding.AUTO)).to.equal(padding.minimalPadding + 1);
      // padme(20) == 20
      expect(padding.paddedFromClearSize(20, padding.Padding.AUTO)).to.equal(padding.padme(20) + 1);
      expect(padding.paddedFromClearSize(21, padding.Padding.AUTO)).to.equal(padding.padme(21) + 1);

      expect(padding.paddedFromClearSize(0, padding.Padding.OFF)).to.equal(2);
      expect(padding.paddedFromClearSize(1, padding.Padding.OFF)).to.equal(2);
      expect(padding.paddedFromClearSize(130, padding.Padding.OFF)).to.equal(130 + 1);

      expect(padding.paddedFromClearSize(0, 2)).to.equal(2 + 1);
      expect(padding.paddedFromClearSize(2, 2)).to.equal(2 + 1);
      expect(padding.paddedFromClearSize(10, 20)).to.equal(20 + 1);
      expect(padding.paddedFromClearSize(20, 20)).to.equal(20 + 1);
    });

    it('pads the data with a minimum padding', () => {
      const trueAsBytes = new Uint8Array([0x74, 0x72, 0x75, 0x65]);
      const actual = padding.padClearData(trueAsBytes);
      expect(actual).to.deep.equal(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
    });

    it('does not fail on an empty array', () => {
      const empty = new Uint8Array(0);
      const actual = padding.padClearData(empty);
      expect(actual).to.deep.equal(new Uint8Array([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
    });

    it('uses the padme algorithm', () => {
      const clear = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x10]);
      const expected = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x10, 0x80, 0x00]);
      expect(padding.padClearData(clear)).to.deep.equal(expected);
    });
  });

  describe('removePadding', () => {
    it('throws if 0x80 is not found or the following bytes are not 0x00', () => {
      const buffers = [
        [],
        [0x74, 0x72, 0x75, 0x65],
        [0x74, 0x72, 0x75, 0x65, 0x00, 0x00, 0x00],
        [0x74, 0x72, 0x75, 0x65, 0x80, 0x42],
        [0x74, 0x72, 0x75, 0x65, 0x80, 0x00, 0x42, 0x00],
        [0x74, 0x72, 0x75, 0x65, 0x80, 0x00, 0x00, 0x42],
      ];

      for (const buffer of buffers)
        expect(() => padding.removePadding(new Uint8Array(buffer))).to.throw();
    });

    it('returns a trimed array', () => {
      expect(padding.removePadding(new Uint8Array([0x80]))).to.deep.equal(new Uint8Array(0));
      expect(padding.removePadding(new Uint8Array([0x80, 0x80]))).to.deep.equal(new Uint8Array([0x80]));
      expect(padding.removePadding(new Uint8Array([0x80, 0x00, 0x00]))).to.deep.equal(new Uint8Array(0));
      expect(padding.removePadding(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x80]))).to.deep.equal(new Uint8Array([0x74, 0x72, 0x75, 0x65]));
      expect(padding.removePadding(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x80, 0x00]))).to.deep.equal(new Uint8Array([0x74, 0x72, 0x75, 0x65]));
      expect(padding.removePadding(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x80, 0x00, 0x80]))).to.deep.equal(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x80, 0x00]));
      expect(padding.removePadding(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x80, 0x00, 0x80, 0x00, 0x00]))).to.deep.equal(new Uint8Array([0x74, 0x72, 0x75, 0x65, 0x80, 0x00]));
    });
  });
});
