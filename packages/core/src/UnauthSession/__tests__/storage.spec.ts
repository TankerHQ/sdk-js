import { expect } from '@tanker/test-utils';

import { UnauthSessionStorage } from '../UnauthSessionStorage';

describe('unauthenticated local storage schema', () => {
  it('defines a schema for the default version', () => {
    expect(UnauthSessionStorage.schemas().find(schema => schema.version == UnauthSessionStorage.defaultVersion)).to.not.be.undefined;
  });

  it('does not reuse tables deleted by previous versions', () => {
    const deletedTables = new Map<string, number>();

    for (const schema of UnauthSessionStorage.schemas()) {
      const { tables, version } = schema;
      for (const table of tables) {
        const { deleted, name } = table;

        expect(
          deletedTables.has(name),
          `table "${name}" is used in version ${version} but was deleted in version ${deletedTables.get(name)}`,
        ).to.be.false;

        if (deleted) {
          deletedTables.set(name, version);
        }
      }
    }
  });
});
