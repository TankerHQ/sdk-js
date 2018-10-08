// @flow
import { expect } from '@tanker/chai';

import { identity, fixObjects, serializeBinary, deserializeBinary } from '../transform';

describe('datastore transform operations', () => {
  it('should return the same value when calling identity', () => {
    const obj = {};

    expect(identity(obj)).to.equal(obj);
  });

  it('should return the value with correct Uint8Array constructor when calling fixObjects', () => {
    // not testable without creating a frame, but at least test the normal case.
    const obj = { array: new Uint8Array(42) };
    const array = [obj.array];

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
