// @flow
import { generateDataStoreTests, type DataStore, type BaseConfig } from '@tanker/datastore-tests';
import { MongoClient } from 'mongodb';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { MongoDBStore } from '../index';

chai.use(chaiAsPromised);


const createDataStoreGenerator = () => async (baseConfig: BaseConfig): Promise<DataStore<*>> => MongoDBStore.open(baseConfig);

if (process.env.TANKER_WEB_MONGODB_RUNNING) {
  generateDataStoreTests('mongodb', createDataStoreGenerator());

  it('creates indexes from schema', async () => {
    const tableName = 'test-mongo-table';
    const dbName = 'test-mongo-db';

    const url = `mongodb://localhost:27017/${dbName}`;
    const client = await MongoClient.connect(url, { useNewUrlParser: true });
    const db = client.db(dbName);
    const collection = db.collection(tableName);
    await collection.deleteMany();

    const schemas = [{
      version: 1,
      tables: [{
        name: tableName,
        indexes: [['a'], ['b'], ['c']]
      }]
    }];
    const config = { dbName, schemas };
    const store = await MongoDBStore.open(config);
    expect(store).to.not.be.undefined;

    const actual = await collection.indexes();
    const indexesName = actual.map((info) => Object.keys(info.key)[0]);
    expect(indexesName).to.have.members(['_id', 'a', 'b', 'c']);

    await db.dropDatabase();
  });
} else {
  console.warn('Tests skipped because TANKER_WEB_MONGODB_RUNNING env var is not set');
}
