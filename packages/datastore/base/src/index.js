// @flow
import type { Schema } from './types';
import * as errors from './errors';
import * as transform from './transform';

export type { BaseConfig, DataStore, SortParams, Schema } from './types';
export { errors, transform };

function scalarArrayEqual<T>(a1: Array<T>, a2: Array<T>): bool {
  return a1.length === a2.length && a1.every((value, index) => value === a2[index]);
}

function assertSchemasVersions(allSchemas: Schema[][]): void {
  if (allSchemas.length === 0)
    return;

  const allVersions = allSchemas[0].map(v => v.version);
  for (const table of allSchemas) {
    const tableVersions = table.map(v => v.version);
    if (!scalarArrayEqual(allVersions, tableVersions)) {
      throw new errors.SchemaError(undefined, `Assertion error: tables have different schema versions: ${JSON.stringify(allSchemas[0])} and ${JSON.stringify(table)}`);
    }
  }
}

export const mergeSchemas = (schemas: Schema[], ...otherSchemas: Schema[][]) => {
  const nestedList = [schemas, ...otherSchemas];

  assertSchemasVersions(nestedList);

  const flatList = nestedList.reduce((acc, val) => acc.concat(val), []);
  const result = [];

  for (const schema of flatList) {
    const { version, tables } = schema;
    const pos = version - 1; // version starts at 1, but positions at 0
    if (!result[pos]) {
      result[pos] = { version, tables: [] };
    }
    result[pos].tables.push(...tables);
  }

  // verify we have defined consecutive versions
  if (result.length !== result.filter(r => !!r).length) {
    throw new errors.SchemaError(undefined, 'Versions are not consecutive');
  }

  return result;
};
