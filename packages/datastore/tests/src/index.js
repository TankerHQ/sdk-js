// @flow
/* eslint-disable no-underscore-dangle */
import { expect } from '@tanker/chai';
import { utils } from '@tanker/crypto';
import { errors as dbErrors, type DataStore, type BaseConfig } from '@tanker/datastore-base';

export type { DataStore, BaseConfig };

const { RecordNotFound, RecordNotUnique } = dbErrors;

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
function cleanRecord(record: Object): TestRecord {
  const { _id, a, b, c, d } = record;
  if ('e' in record) { // optional field
    return { _id, a, b, c, d, e: record.e };
  }
  return { _id, a, b, c, d };
}


export type DataStoreGenerator = (baseConfig: BaseConfig) => Promise<DataStore<*>>;
export const generateDataStoreTests = (dataStoreName: string, generator: DataStoreGenerator) => describe(`DataStore generic tests: ${dataStoreName}`, () => {
  // Here are a few useful test constants
  const tableName = 'test-table';
  const dbName = 'test-db';
  const schemas = [{
    version: 1,
    tables: [{
      name: tableName,
      indexes: [['a'], ['b'], ['c']]
    }]
  }];
  const storeConfig = { dbName, schemas };

  const binary = new Uint8Array(32);
  binary[0] = 42;
  binary[10] = 255;

  // Note: 'd' is not indexable since it contains null values
  // see: https://www.w3.org/TR/IndexedDB/#key-construct
  const record1 = { _id: 'key1', a: '1', b: 'b', c: 3, d: 'd' };
  const record2 = { _id: 'key2', a: '2', b: 'b', c: 1, d: null, e: 'e' };
  const record3 = { _id: 'key3', a: '3', b: 'z', c: 2, d: binary, e: 'e' };

  it('persists data after reopening', async () => {
    const store1 = await generator(storeConfig);
    await store1.put(tableName, record1);
    await store1.close();
    const store2 = await generator(storeConfig);
    const result = await store2.get(tableName, record1._id);
    expect(cleanRecord(result)).to.deep.equal(record1);
    await store2.close();
  });

  it('can be destroyed', async () => {
    const store1 = await generator(storeConfig);
    await store1.put(tableName, record1);
    await store1.destroy();
    const store2 = await generator(storeConfig);
    const actual = await store2.getAll(tableName);
    expect(actual).to.be.an('array').that.is.empty;
    await store2.close();
  });


  describe('schemas', () => {
    it('can add new indexes with a new schema', async () => {
      const testSchemasdbName = 'datastore-test-schemas';
      const customConfig = {
        ...storeConfig,
        dbName: testSchemasdbName,
        schemas: [
          {
            version: 1,
            tables: [{
              name: tableName,
              indexes: [['a']]
            }]
          }
        ]
      };

      const storeWithOldSchema = await generator(customConfig);

      await storeWithOldSchema.put(tableName, record1);
      await storeWithOldSchema.put(tableName, record2);
      await storeWithOldSchema.put(tableName, record3);
      await storeWithOldSchema.close();

      customConfig.schemas.push({
        version: 2,
        tables: [{
          name: tableName,
          indexes: [['b'], ['c']]
        }]
      });

      const storeWithNewSchema = await generator(customConfig);
      const result = await storeWithNewSchema.find(tableName, { selector: { b: record1.b } });
      expect(result.map(cleanRecord)).to.deep.equal([record1, record2]);
      await storeWithNewSchema.destroy();
      await storeWithNewSchema.close();
    });
  });

  describe('with one store', () => {
    let store;
    before(async () => {
      store = await generator(storeConfig);
    });

    beforeEach(async () => {
      await store.clear(tableName);
    });

    after(async () => {
      await store.destroy();
      await store.close();
    });


    describe('basic operations', () => {
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

      it('can add and get back a normal record', async () => {
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

      it('can add a record only once', async () => {
        await store.add(tableName, record1);
        await expect(store.add(tableName, record1)).to.be.rejectedWith(RecordNotUnique);
      });

      it('can put a record several times', async () => {
        await store.put(tableName, record1);
        const updatedRecord = { ...record1 };
        updatedRecord.a = 'newValue';
        await store.put(tableName, updatedRecord);
        const actual = await store.get(tableName, record1._id);
        expect(actual.a).to.eq('newValue');
      });

      it('overrides existing records', async () => {
        await store.put(tableName, record1);
        const updatedRecord = { ...record1 };
        delete updatedRecord.a;
        await store.put(tableName, updatedRecord);
        const actual = await store.get(tableName, record1._id);
        expect(actual.a).to.be.undefined;
      });

      it('can delete record', async () => {
        await store.bulkPut(tableName, [record1, record2, record3]);
        await store.delete(tableName, record2._id);
        const result = await store.getAll(tableName);
        expect(result.map(cleanRecord)).to.deep.equal([record1, record3]);
      });

      it('can delete non-existing record', async () => {
        await store.bulkPut(tableName, [record1, record2, record3]);
        await store.delete(tableName, 'blah');
        const result = await store.getAll(tableName);
        expect(result.map(cleanRecord)).to.deep.equal([record1, record2, record3]);
      });
    });

    describe('bulk operations', () => {
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

    describe('queries', () => {
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

      it('can find the list of all records matching a value', async () => {
        const result = await store.find(tableName, { selector: { b: record1.b } });
        expect(result.map(cleanRecord)).to.have.deep.members([record1, record2]);
      });

      it('can sort results', async () => {
        const result = await store.find(tableName, { sort: [{ c: 'desc' }] });
        expect(result.map(x => x.c)).to.deep.equal([3, 2, 1]);
      });

      it('can find records with comparison operators', async () => {
        const result1 = await store.find(tableName, { sort: [{ c: 'asc' }], selector: { c: { $gt: 1 } } });
        const result2 = await store.find(tableName, { sort: [{ c: 'asc' }], selector: { c: { $gte: 2 } } });
        const result3 = await store.find(tableName, { sort: [{ c: 'asc' }], selector: { c: { $lt: 3 } } });
        const result4 = await store.find(tableName, { sort: [{ c: 'asc' }], selector: { c: { $lte: 2 } } });
        expect(result1.map(cleanRecord)).to.deep.equal([record3, record1]);
        expect(result2.map(cleanRecord)).to.deep.equal([record3, record1]);
        expect(result3.map(cleanRecord)).to.deep.equal([record2, record3]);
        expect(result4.map(cleanRecord)).to.deep.equal([record2, record3]);
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
