import { expect } from '@tanker/test-utils';

import { identity, fixObjects, serializeBinary, deserializeBinary } from '../transform';

describe('datastore transform operations', () => {
  it('should return the same value when calling identity', () => {
    const obj = {};

    expect(identity(obj)).to.equal(obj);
  });

  it('should be a no-op when calling fixObjects on objects of the current frame', () => {
    const obj = { key: new Uint8Array(42) };
    const array = [new Uint8Array(42)];

    expect(fixObjects(obj)).to.deep.equal(obj);
    expect(fixObjects(array)).to.deep.equal(array);
  });

  it('should serialize/deserialize binary data', () => {
    const obj = { array: new Uint8Array(42) };
    const array = [obj.array];
    const uint8 = obj.array;

    const serializedObj = serializeBinary(obj);
    const serializedArray = serializeBinary(array);
    const serializedUint8 = serializeBinary(uint8);

    expect(serializedObj.array).to.deep.equal(serializedUint8);
    expect(serializedArray[0]).to.deep.equal(serializedUint8);

    const deserializedUint8 = deserializeBinary(serializedUint8);
    const deserializedArray = deserializeBinary(serializedArray);
    const deserializedObj = deserializeBinary(serializedObj);

    expect(deserializedUint8).to.deep.equal(uint8);
    expect(deserializedObj.array).to.deep.equal(deserializedUint8);
    expect(deserializedArray[0]).to.deep.equal(deserializedUint8);
  });
});
