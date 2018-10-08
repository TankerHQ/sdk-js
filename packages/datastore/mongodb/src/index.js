// @flow

import { errors as dbErrors, type Schema, type BaseConfig } from '@tanker/datastore-base';

import mongodb, { MongoClient, Db } from 'mongodb';

// Mongo stores Uint8Array into its on mongodb.Binary type,
// so we need to convert Uint8Array coming from the DataStore API
// to Binary objects and vice-versa.

function getTypeAsString(value: any) {
  if (value instanceof mongodb.Binary) return 'mongodb.Binary';
  if (value instanceof Uint8Array) return 'uint8';
  if (value instanceof Array) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function walk(value: any, fun: Function) {
  let result;
  const type = getTypeAsString(value);

  switch (type) {
    case 'object':
      result = { ...value };
      Object.keys(result).forEach(k => {
        result[k] = walk(result[k], fun);
      });
      break;
    case 'array':
      result = [...value];
      result.forEach((el, k) => {
        result[k] = walk(el, fun);
      });
      break;
    default:
      result = fun(value, type);
  }

  return result;
}


const binaryToUint8 = value => {
  if (value instanceof mongodb.Binary) {
    // Note: we can't simply return a Nodejs Buffer here:
    // instead we need a _real_ Uint8Array because
    //  * the Buffer class does not behave properly for our usage
    //  * most of the rest of the code expects Uint8Array anyway
    const length = value.length();
    const buffer = value.read(0, length);
    return new Uint8Array(buffer);
  } else {
    return value;
  }
};

const docToRecord = obj => {
  const res = walk(obj, binaryToUint8);
  return res;
};

const uint8ToBinary = (value) => {
  if (value instanceof Uint8Array) {
    return new mongodb.Binary(Buffer.from(value.buffer));
  } else {
    return value;
  }
};

const recordToDoc = obj => {
  const res = walk(obj, uint8ToBinary);
  return res;
};

const onMongoError = (error) => {
  if (error.code === 11000) {
    throw new dbErrors.RecordNotUnique(error);
  } else {
    console.error(error);
    throw new dbErrors.UnknownError(error);
  }
};

// Mongo does not really know how to update or insert in bulk, so build a list
// of write operations and call bulkWrite() afterwards
// Source: https://stackoverflow.com/questions/40244739/insert-or-update-many-documents-in-mongodb
const buildBulkAddOps = records => {
  const ops = [];
  records.forEach(record => {
    ops.push({
      updateOne: {
        /* eslint-disable no-underscore-dangle */
        filter: { _id: record._id },
        update: {
          $setOnInsert: recordToDoc(record),
        },
        upsert: true
      }
    });
  });
  return ops;
};

const buildBulkPutOps = records => {
  const ops = [];
  records.forEach(record => {
    ops.push({
      replaceOne: {
        /* eslint-disable no-underscore-dangle */
        filter: { _id: record._id },
        replacement: recordToDoc(record),
        upsert: true
      }
    });
  });
  return ops;
};


// Convert query from DataStore to arguments for MongoClient.find or findOne

const convertQuery = (query) => {
  if (!query) {
    return { mongoQuery: {}, mongoOptions: {} };
  }
  const { selector, sort } = query;

  const mongoQuery = selector; // DataStore API uses the same syntax as Mongo ;)

  const mongoOptions = {};
  mongoOptions.sort = [];
  if (sort) {
    sort.forEach(elem => {
      const key = Object.keys(elem)[0];
      const value = elem[key];
      if (value === 'asc') {
        mongoOptions.sort.push([key, 'ascending']);
      }
      if (value === 'desc') {
        mongoOptions.sort.push([key, 'descending']);
      }
    });
  }

  return { mongoQuery, mongoOptions };
};

export class MongoDBStore {
  _client: MongoClient;
  dbName: string;

  static async open(config: BaseConfig): Promise<MongoDBStore> {
    const { dbName } = config;
    const url = config.url || 'mongodb://localhost:27017/';
    const client = await MongoClient.connect(url, { useNewUrlParser: true });
    const res = new MongoDBStore(client);
    res.dbName = dbName;

    // $FlowIKnow
    await res.defineSchemas(config.schemas);
    return res;
  }

  get _db(): Db {
    return this._client.db(this.dbName);
  }

  constructor(client: MongoClient) {
    this._client = client;
  }

  add = async (table: string, record: Object) => {
    const collection = this._db.collection(table);
    try {
      await collection.insertOne(recordToDoc(record));
    } catch (error) {
      onMongoError(error);
    }
  }

  bulkAdd = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const all = (records instanceof Array) ? records : [records, ...otherRecords];
    // MongoClient does not like when the write operations are an empty array
    if (all.length === 0) {
      return;
    }
    const ops = buildBulkAddOps(all);
    try {
      const collection = this._db.collection(table);
      await collection.bulkWrite(ops);
    } catch (error) {
      onMongoError(error);
    }
  }

  bulkDelete = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const all = (records instanceof Array) ? records : [records, ...otherRecords];
    /* eslint-disable no-underscore-dangle */
    const query = { _id: { $in: all.map(x => x._id) } };
    const collection = this._db.collection(table);
    try {
      await collection.deleteMany(query);
    } catch (error) {
      onMongoError(error);
    }
  }

  bulkPut = async (table: string, records: Array<Object> | Object, ...otherRecords: Array<Object>) => {
    const all = (records instanceof Array) ? records : [records, ...otherRecords];
    // MongoClient does not like when the write operations are an empty array
    if (all.length === 0) {
      return;
    }
    // https://stackoverflow.com/questions/40244739/insert-or-update-many-documents-in-mongodb
    const ops = buildBulkPutOps(all);
    try {
      const collection = this._db.collection(table);
      await collection.bulkWrite(ops);
    } catch (error) {
      onMongoError(error);
    }
  }

  async destroy(): Promise<void> {
    try {
      await this._db.dropDatabase();
    } catch (error) {
      // Automatic tests may call destroy() twice, so just
      // ignore when trying to destroy a non-existing db
      if (error.message !== 'topology was destroyed') {
        onMongoError(error);
      }
    }
  }

  get className(): string {
    return 'MongoDBStore';
  }

  async clear(table: string): Promise<void> {
    const collection = this._db.collection(table);
    await collection.deleteMany();
  }

  async close(): Promise<void> {
    await this._client.close();
  }

  // eslint-disable-next-line
  async defineSchemas(schemas: Array<Schema>): Promise<void> {
    for (const schema of schemas) {
      const { tables } = schema;

      for (const table of tables) {
        const { name, indexes } = table;
        if (indexes) {
          const indexesSpec = [];
          for (const index of indexes) {
            // $FlowIKnow
            const indexSpec = { key: { [index]: 1 } };
            indexesSpec.push(indexSpec);
          }
          const collection = this._db.collection(name);
          await collection.createIndexes(indexesSpec);
        }
      }
    }
  }

  find = async (table: string, query: Object) => {
    try {
      const collection = this._db.collection(table);
      const { mongoQuery, mongoOptions } = convertQuery(query);
      const cursor = collection.find(mongoQuery, mongoOptions);
      const mapped = cursor.map(docToRecord);
      return await mapped.toArray();
    } catch (error) {
      onMongoError(error);
    }
  }

  first = async (table: string, query: Object) => {
    try {
      const collection = this._db.collection(table);
      const { mongoQuery, mongoOptions } = convertQuery(query);
      const res = await collection.findOne(mongoQuery, mongoOptions);
      return docToRecord(res);
    } catch (error) {
      onMongoError(error);
    }
  }

  get = async (table, id: string) => {
    const collection = this._db.collection(table);
    let res;
    try {
      res = await collection.findOne({ _id: id });
    } catch (error) {
      onMongoError(error);
    }
    if (res == null) {
      throw new dbErrors.RecordNotFound();
    }
    return docToRecord(res);
  }

  getAll = async (table: string) => {
    const res = await this.find(table, {});
    return res;
  }

  put = async (table: string, record: Object) => {
    const collection = this._db.collection(table);
    try {
      await collection.replaceOne({ _id: record._id }, recordToDoc(record), { upsert: true });
    } catch (error) {
      onMongoError(error);
    }
  }

  delete = async (table: string, id: string) => {
    const collection = this._db.collection(table);
    try {
      await collection.deleteOne({ _id: id });
    } catch (error) {
      onMongoError(error);
    }
  }
}

export default () => MongoDBStore;
