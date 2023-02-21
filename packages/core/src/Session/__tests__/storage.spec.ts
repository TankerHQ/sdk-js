import { expect } from '@tanker/test-utils';

import { StorageSchema } from '../Storage';

describe('local storage schema', () => {
  it('does not reuse tables deleted by previous versions', () => {
    const deletedTables = new Map<string, number>();

    for (const schema of StorageSchema.versions()) {
      const { tables, version } = schema;

      for (const table of tables) {
        const { deleted, name } = table;

        expect(
          !deleted && deletedTables.has(name),
          `table "${name}" is used in version ${version} but was deleted in version ${deletedTables.get(name)}`,
        ).to.be.false;

        if (deleted) {
          deletedTables.set(name, version);
        }
      }
    }
  });
});
