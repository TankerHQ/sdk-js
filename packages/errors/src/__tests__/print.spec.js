// @flow
import { expect } from '@tanker/test-utils';

import { safePrintType, safePrintValue } from '../print';

describe('print', () => {
  let values;
  let expectedTypes;
  let expectedValues;

  before(() => {
    values = [
      undefined,
      null,
      'it is a piece of text',
      32,
      NaN,
      function myFync() {},
      () => 'anonymous',
      {},
      { a: { nested: 'key' } },
      Object.create(null), // bare object
      [],
      [0, { a: 'a', b: 2 }, null],
      new Uint8Array(5),
      new Uint8Array(1000),
      (new Uint8Array(5)).buffer,
    ];

    expectedTypes = [
      'undefined',
      'null',
      'string',
      'number',
      'number',
      'function',
      'function',
      'Object',
      'Object',
      'Object',
      'Array(0)',
      'Array(3)',
      'Uint8Array(5)',
      'Uint8Array(1000)',
      'ArrayBuffer',
    ];

    expectedValues = [
      'undefined',
      'null',
      '"it is a piece of text"',
      '32',
      'NaN',
      '[source code]',
      '[source code]',
      '{}',
      '{"a":{"nested":"key"}}',
      '{}',
      '[]',
      '[0,{"a":"a","b":2},null]',
      '{"0":0,"1":0,"2":0,"3":0,"4":0}',
      '[too big to print]',
      '{}',
    ];
  });

  it('should print types correctly', () => {
    for (let i = 0; i < values.length; i++) {
      expect(safePrintType(values[i]), `failed type check #${i}`).to.equal(expectedTypes[i]);
    }
  });

  it('should print values correctly', () => {
    for (let i = 0; i < values.length; i++) {
      expect(safePrintValue(values[i]), `failed type check #${i}`).to.equal(expectedValues[i]);
    }
  });
});
