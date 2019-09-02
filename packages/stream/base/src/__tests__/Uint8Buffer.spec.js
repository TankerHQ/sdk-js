// @flow
import { InvalidArgument } from '@tanker/errors';
import { expect } from '@tanker/test-utils';

import Uint8Buffer from '../Uint8Buffer';

describe('Uint8Buffer', () => {
  it('throws InvalidArgument when consuming more than stored data', () => {
    const buffer = new Uint8Buffer();

    expect(() => buffer.consume(30)).to.throw(InvalidArgument);

    buffer.push(new Uint8Array(40));

    expect(() => buffer.consume(11)).to.not.throw();
    expect(() => buffer.consume(30)).to.throw(InvalidArgument);
  });

  it('can store/consume data and keeps track of stored size', () => {
    const buffer = new Uint8Buffer();

    const data = new Uint8Array([
      65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77,
      78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
    ]);

    expect(buffer.byteSize()).to.equal(0);

    buffer.push(new Uint8Array(0));
    expect(buffer.byteSize()).to.equal(0);

    buffer.push(data.subarray(0, 10));
    expect(buffer.byteSize()).to.equal(10);

    buffer.push(data.subarray(10));

    for (let i = 0; i < data.length / 2; ++i) {
      expect(buffer.byteSize()).to.equal(data.length - i * 2);
      expect(buffer.consume(2)).to.deep.equal(data.subarray(i * 2, i * 2 + 2));
    }

    expect(buffer.byteSize()).to.equal(0);
  });
});
