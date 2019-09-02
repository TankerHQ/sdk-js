// @flow

import { expect } from '@tanker/test-utils';

import { SchemaError } from '../errors';
import { mergeSchemas } from '../index';

describe('datastore schemas', () => {
  it('should throw when schemas have different versions', () => {
    const firstSchemas = [{ version: 1, tables: [] }, { version: 2, tables: [] }];
    const secondSchemas = [{ version: 2, tables: [] }];

    expect(() => mergeSchemas(firstSchemas, secondSchemas)).to.throw(SchemaError);
  });

  it('should throw when schemas\' versions are not consecutive', () => {
    const schemas = [{ version: 1, tables: [] }, { version: 3, tables: [] }];

    expect(() => mergeSchemas(schemas)).to.throw(SchemaError);
  });

  it('should merge schemas', () => {
    const firstSchemas = [{ version: 1, tables: [{ name: 'first', indexes: [['first', 'second'], ['third']] }] }, { version: 2, tables: [] }];
    const secondSchemas = [{ version: 1, tables: [{ name: 'second', indexes: [] }] }, { version: 2, tables: [{ name: 'last', indexes: [['last']] }] }];

    const mergedSchemas = mergeSchemas(firstSchemas, secondSchemas);
    const expected = [
      {
        version: 1,
        tables: [
          {
            name: 'first',
            indexes: [['first', 'second'], ['third']]
          },
          {
            name: 'second',
            indexes: []
          }]
      },
      {
        version: 2,
        tables: [
          {
            name: 'last',
            indexes: [['last']]
          }
        ]
      }
    ];

    expect(mergedSchemas).to.deep.equal(expected);
  });
});
