// @flow
/* eslint-disable no-underscore-dangle */
import { utils } from '@tanker/crypto';
import { errors as dbErrors, type DataStore, type BaseConfig } from '@tanker/datastore-base';
import { expect, uuid } from '@tanker/test-utils';

export type { DataStore, BaseConfig };

const { RecordNotFound, RecordNotUnique, UnknownError } = dbErrors;

type TestRecord = {|
  _id: string,
  a: string,
  b: string,
  c: number,
  d: ?(string | Uint8Array),
  e?: string
|}

// Keep only the original properties, e.g. strip PouchDB private
// property '_rev' representing the record's current revision.
const cleanRecord = (record: Object): TestRecord => {
  const { _id, a, b, c, d } = record;
  if ('e' in record) { // optional field
    return { _id, a, b, c, d, e: record.e };
  }
  return { _id, a, b, c, d };
};

const makeDBName = () => `test-db-${uuid.v4().replace('-', '').slice(0, 12)}`;

export type DataStoreGenerator = (baseConfig: BaseConfig) => Promise<DataStore<*>>;

export const generateDataStoreTests = (dataStoreName: string, generator: DataStoreGenerator) => describe(`DataStore generic tests: ${dataStoreName}`, () => {
  // Here are a few useful test constants
  const tableName = 'test-table';

  const schemas = [{
    version: 1,
    tables: [{
      name: tableName,
      indexes: [['a'], ['b'], ['c']]
    }]
  }];

  const binary = new Uint8Array(32);
  binary[0] = 42;
  binary[10] = 255;

  // Note: 'd' is not indexable since it contains null values
  // see: https://www.w3.org/TR/IndexedDB/#key-construct
  const record1 = { _id: 'key1', a: '1', b: 'b', c: 3, d: 'd' };
  const record2 = { _id: 'key2', a: '2', b: 'b', c: 1, d: null, e: 'e' };
  const record3 = { _id: 'key3', a: '3', b: 'z', c: 2, d: binary, e: 'e' };

  describe('admin operations', () => {
    let storeConfig;

    beforeEach(() => {
      storeConfig = { dbName: makeDBName(), schemas: [...schemas] };
    });

    it('persists data after reopening', async () => {
      const store1 = await generator(storeConfig);
      await store1.put(tableName, record1);
      await store1.close();
      const store2 = await generator(storeConfig);
      const result = await store2.get(tableName, record1._id);
      expect(cleanRecord(result)).to.deep.equal(record1);
      await store2.close();
    });

    it('can be destroyed and re-created empty', async () => {
      const store1 = await generator(storeConfig);
      await store1.put(tableName, record1);
      await store1.destroy();
      const store2 = await generator(storeConfig);
      const actual = await store2.getAll(tableName);
      expect(actual).to.be.an('array').that.is.empty;
      await store2.close();
    });

    it('can add new indexes with a new schema', async () => {
      // Populate store
      const store = await generator(storeConfig);
      await store.put(tableName, record1);
      await store.put(tableName, record2);
      await store.put(tableName, record3);
      await store.close();

      // Upgrade the schema
      storeConfig.schemas.push({
        version: 2,
        tables: [{
          name: tableName,
          indexes: [['a'], ['b'], ['c'], ['e']] // add index on 'e'
        }]
      });

      const storeWithNewSchema = await generator(storeConfig);

      // Check new index on 'e' is usable
      const result = await storeWithNewSchema.find(tableName, { selector: { e: record2.e } });
      expect(result.map(cleanRecord)).to.deep.equal([record2, record3]);
      await storeWithNewSchema.close();
    });

    it('can delete a table with a new schema', async () => {
      // Populate store
      const store = await generator(storeConfig);
      await store.put(tableName, record1);
      await store.close();

      // Upgrade the schema
      storeConfig.schemas.push({
        version: 2,
        tables: [{
          name: tableName,
          deleted: true, // delete the only table
        }]
      });

      const storeWithNewSchema = await generator(storeConfig);

      // Check the table can't be used anymore
      await expect(storeWithNewSchema.get(tableName, record1._id)).to.be.rejectedWith(UnknownError);
      await storeWithNewSchema.close();
    });
  });

  describe('regular operations', () => {
    let store;

    before(async () => {
      store = await generator({ dbName: makeDBName(), schemas });
    });

    beforeEach(async () => {
      await store.clear(tableName);
    });

    after(async () => {
      await store.destroy();
      await store.close();
    });

    describe('basic queries', () => {
      it('can clear records', async () => {
        await store.put(tableName, record1);
        await store.put(tableName, record2);
        await store.clear(tableName);
        const result = await store.getAll(tableName);
        expect(result).to.be.an('array').that.is.empty;
      });

      it('throws RecordNotFound when record is not found', async () => {
        await store.put(tableName, record1);
        await expect(store.get(tableName, record2._id)).to.be.rejectedWith(RecordNotFound);
      });

      it('can add and get back a simple record', async () => {
        await store.add(tableName, record1);
        const actual = await store.get(tableName, record1._id);
        expect(cleanRecord(actual)).to.deep.equal(cleanRecord(record1));
      });

      it('can add and get back a record containing binary data', async () => {
        await store.add(tableName, record3);
        const actual = await store.get(tableName, record3._id);
        const actualBinary = actual.d;
        expect(actualBinary).to.be.instanceof(Uint8Array);
        expect(utils.equalArray(actualBinary, record3.d)).to.be.true;
        expect(actualBinary.length).to.eq(record3.d.length);
        expect(cleanRecord(actual)).to.deep.equal(cleanRecord(record3));
      });

      it('can add and get back a record containing nested binary data', async () => {
        const record4 = { _id: '4', a: { b: { c: binary } } };
        await store.add(tableName, record4);
        const actual = await store.get(tableName, record4._id);
        const actualBinary = actual.a.b.c;
        expect(utils.equalArray(actualBinary, record4.a.b.c)).to.be.true;
        expect(actualBinary.length).to.eq(record4.a.b.c.length);
        expect(cleanRecord(actual)).to.deep.equal(cleanRecord(record4));
      });

      it('can not add a record with a primary key already in use', async () => {
        await store.add(tableName, record1);
        await expect(store.add(tableName, { _id: record1._id })).to.be.rejectedWith(RecordNotUnique);
      });

      it('can put a record several times, with updates', async () => {
        await store.put(tableName, record1);
        const updatedRecord: TestRecord = { ...record1 };
        updatedRecord.a = 'newValue';
        delete updatedRecord.d;
        await store.put(tableName, updatedRecord);
        const actual = await store.get(tableName, record1._id);
        expect(actual.a).to.eq('newValue');
        expect('d' in actual).to.be.false;
      });

      it('can delete a record', async () => {
        await store.bulkPut(tableName, [record1, record2, record3]);
        await store.delete(tableName, record2._id);
        const result = await store.getAll(tableName);
        expect(result.map(cleanRecord)).to.deep.equal([record1, record3]);
      });

      it('can delete a non-existing record', async () => {
        await store.bulkPut(tableName, [record1, record2, record3]);
        await store.delete(tableName, 'blah');
        const result = await store.getAll(tableName);
        expect(result.map(cleanRecord)).to.deep.equal([record1, record2, record3]);
      });
    });

    describe('bulk queries', () => {
      it('can bulk add some records', async () => {
        await store.bulkAdd(tableName, [record1, record2]);
        const result1 = await store.getAll(tableName);
        expect(result1.map(cleanRecord)).to.deep.equal([record1, record2]);
      });

      it('can bulk add empty arrays', async () => {
        await store.bulkAdd(tableName, []);
        const all = await store.getAll(tableName);
        expect(all).to.be.an('array').that.is.empty;
      });

      it('can bulk put empty arrays', async () => {
        await store.bulkPut(tableName, []);
        const all = await store.getAll(tableName);
        expect(all).to.be.an('array').that.is.empty;
      });

      it('can bulk delete empty arrays', async () => {
        await store.bulkPut(tableName, [record1, record2]);
        await store.bulkDelete(tableName, []);
        const all = await store.getAll(tableName);
        expect(all.length).to.be.equal(2);
      });

      it('bulk add and does not update aready existing records', async () => {
        await store.bulkAdd(tableName, [record1, record2]);
        const newRecord2 = { ...record2, e: 'new value' };
        await store.bulkAdd(tableName, [newRecord2, record3]); // expect newRecord2 to be silently ignored
        const result2 = await store.getAll(tableName);
        expect(result2.map(cleanRecord)).to.deep.equal([record1, record2, record3]);
      });

      it('can bulk put same records several times', async () => {
        await store.bulkPut(tableName, [record1, record2]);
        const result1 = await store.getAll(tableName);
        expect(result1.map(cleanRecord)).to.deep.equal([record1, record2]);

        const newRecord2 = { ...record2, e: 'new value' };
        await store.bulkPut(tableName, [newRecord2, record3]);
        const result2 = await store.getAll(tableName);
        expect(result2.map(cleanRecord)).to.deep.equal([record1, newRecord2, record3]);
      });

      it('can bulk put and bulk delete records (passing an array)', async () => {
        await store.bulkPut(tableName, [record1, record2, record3]);
        const result1 = await store.getAll(tableName);
        expect(result1.map(cleanRecord)).to.deep.equal([record1, record2, record3]);

        await store.bulkDelete(tableName, [record2, record3]); // except record1
        const result2 = await store.getAll(tableName);
        expect(result2.map(cleanRecord)).to.deep.equal([record1]);
      });

      it('can bulk put and bulk delete records (using variadic args)', async () => {
        await store.bulkPut(tableName, record1, record2, record3);
        const result1 = await store.getAll(tableName);
        expect(result1.map(cleanRecord)).to.deep.equal([record1, record2, record3]);

        await store.bulkDelete(tableName, record1, record3); // except record2
        const result2 = await store.getAll(tableName);
        expect(result2.map(cleanRecord)).to.deep.equal([record2]);
      });
    });

    describe('advanced queries', () => {
      beforeEach(async () => {
        await store.bulkAdd(tableName, [record1, record2, record3]);
      });

      it('can find the first record to match selector or sort', async () => {
        const result1 = await store.first(tableName, { selector: { a: record1.a } });
        const result2 = await store.first(tableName, { selector: { a: record2.a } });
        const result3 = await store.first(tableName, { sort: [{ a: 'asc' }] });
        const result4 = await store.first(tableName, { sort: [{ a: 'desc' }] });
        const result5 = await store.first(tableName);
        expect(cleanRecord(result1)).to.deep.equal(record1);
        expect(cleanRecord(result2)).to.deep.equal(record2);
        expect(cleanRecord(result3)).to.deep.equal(record1);
        expect(cleanRecord(result4)).to.deep.equal(record3);
        expect(cleanRecord(result5)).to.deep.equal(record1);
      });

      it('can find the list of all records matching a value (2 flavors)', async () => {
        const result1 = await store.find(tableName, { selector: { b: record1.b } });
        const result2 = await store.find(tableName, { selector: { b: { $eq: record1.b } } });
        expect(result1.map(cleanRecord)).to.have.deep.members([record1, record2]);
        expect(result2.map(cleanRecord)).to.have.deep.members([record1, record2]);
      });

      it('can sort results in ascending order', async () => {
        const result = await store.find(tableName, { sort: [{ c: 'asc' }] });
        expect(result.map(x => x.c)).to.deep.equal([1, 2, 3]);
      });

      it('can sort results in descending order', async () => {
        const result = await store.find(tableName, { sort: [{ c: 'desc' }] });
        expect(result.map(x => x.c)).to.deep.equal([3, 2, 1]);
      });

      it('can limit the number of results', async () => {
        const result1 = await store.find(tableName, { sort: [{ c: 'asc' }], limit: 2 });
        const result2 = await store.find(tableName, { sort: [{ c: 'desc' }], limit: 1 });
        expect(result1.map(x => x.c)).to.deep.equal([1, 2]);
        expect(result2.map(x => x.c)).to.deep.equal([3]);
      });

      it('can find records with comparison operators', async () => {
        const sort = [{ c: 'asc' }];
        const result1 = await store.find(tableName, { sort, selector: { c: { $gt: 1 } } });
        const result2 = await store.find(tableName, { sort, selector: { c: { $gte: 2 } } });
        const result3 = await store.find(tableName, { sort, selector: { c: { $lt: 3 } } });
        const result4 = await store.find(tableName, { sort, selector: { c: { $lte: 2 } } });
        const result5 = await store.find(tableName, { sort, selector: { _id: { $in: ['key2', 'key3'] } } });
        expect(result1.map(cleanRecord)).to.deep.equal([record3, record1]);
        expect(result2.map(cleanRecord)).to.deep.equal([record3, record1]);
        expect(result3.map(cleanRecord)).to.deep.equal([record2, record3]);
        expect(result4.map(cleanRecord)).to.deep.equal([record2, record3]);
        expect(result5.map(cleanRecord)).to.deep.equal([record2, record3]);
      });

      it('can find records with $in operator', async () => {
        const result1 = await store.find(tableName, { selector: { a: { $in: ['2', '1'] } } });
        expect(result1.map(cleanRecord)).to.deep.equal([record1, record2]);
      });

      it('can find records with $ne operator', async () => {
        const result1 = await store.find(tableName, { selector: { b: { $ne: 'b' } } });
        expect(result1.map(cleanRecord)).to.deep.equal([record3]);
      });

      it('can find records with multiple selectors', async () => {
        // Note: at least one operator given MUST match an index
        const result1 = await store.find(tableName, { selector: { a: { $gte: '2' }, c: { $lt: 2 } } }); // both indexed
        const result2 = await store.find(tableName, { selector: { b: 'b', d: null } });
        const result3 = await store.find(tableName, { selector: { b: 'b', d: { $ne: null } } });
        expect(result1.map(cleanRecord)).to.deep.equal([record2]);
        expect(result2.map(cleanRecord)).to.deep.equal([record2]);
        expect(result3.map(cleanRecord)).to.deep.equal([record1]);
      });

      it('can find records with $exists operator on secondary field', async () => {
        // Note: we're not implementing it on the primary search field as it's not
        //       performant at all and can be achieved with a simple getAll()
        //       followed by a javascript filter!
        const result1 = await store.find(tableName, { selector: { b: 'b', e: { $exists: true } } });
        const result2 = await store.find(tableName, { selector: { b: 'b', e: { $exists: false } } });
        expect(result1.map(cleanRecord)).to.deep.equal([record2]);
        expect(result2.map(cleanRecord)).to.deep.equal([record1]);
      });
    });
  });
});
