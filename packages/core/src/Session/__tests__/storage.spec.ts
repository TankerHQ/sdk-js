import { expect } from '@tanker/test-utils';

import { StorageSchema } from '../Storage';

describe('local storage schema', () => {
  it('does not reuse tables deleted by previous versions', () => {
    const deletedTable: Record<string, number> = {};
    for (const version of StorageSchema.versions()) {
      for (const table of version.tables) {
        const deleted = table.deleted;
        const name = table.name;
        const deletedSince = deletedTable[name];

        expect(
          !deleted && deletedSince !== undefined,
          `table "${name}" is used in version ${version.version} but was deleted in version ${deletedSince}`,
        ).to.be.false;

        if (deleted) {
          deletedTable[name] ||= version.version;
        }
      }
    }
  });
});
