// @flow
import { utils } from '@tanker/crypto';

import { expect } from './chai';
import Uint8Buffer from '../Uint8Buffer';

describe('Uint8Buffer', () => {
  it('throws NotEnoughData when consuming more than stored data', () => {
    const buffer = new Uint8Buffer();

    expect(() => buffer.consume(30)).to.throw('NotEnoughData');

    buffer.push(new Uint8Array(40));

    expect(() => buffer.consume(11)).to.not.throw();
    expect(() => buffer.consume(30)).to.throw('NotEnoughData');
  });

  it('can store/consume data and keeps track of stored size', () => {
    const buffer = new Uint8Buffer();

    const data = utils.fromString('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

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
