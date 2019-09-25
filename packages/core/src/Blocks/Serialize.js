// @flow
import varint from 'varint';
import { InternalError } from '@tanker/errors';

type Unserializer = (src: Uint8Array, offset: number) => { newOffset: number, [name: string]: any };

export function getArray(src: Uint8Array, offset: number, name: string = 'value'): Object {
  let pos = offset;
  const len = varint.decode(src, pos);
  pos += varint.decode.bytes;
  const buffer = new Uint8Array(src.subarray(pos, pos + len)); // don't use slice, doesn't work on IE11
  pos += len;
  return { [name]: buffer, newOffset: pos };
}

export function setStaticArray(src: Uint8Array, dest: Uint8Array, offset: number = 0): number {
  dest.set(src, offset);
  return offset + src.length;
}

export function getStaticArray(buf: Uint8Array, size: number, offset: number = 0, name: string = 'value'): { newOffset: number, [name: string]: Uint8Array } {
  if (offset + size > buf.length)
    throw new InternalError('Out of bounds read in getStaticArray');
  const arr = new Uint8Array(buf.subarray(offset, offset + size)); // don't use slice, doesn't work on IE11
  return { [name]: arr, newOffset: offset + size };
}

export function unserializeGenericSub(data: Uint8Array, functions: Array<Unserializer>, offset: number, name: string = 'value'): Object {
  let newOffset = offset;
  let result = {};
  for (const f of functions) {
    let value;
    ({ newOffset, ...value } = f(data, newOffset));
    result = { ...result, ...value };
  }

  return { [name]: result, newOffset };
}

export function unserializeGeneric<T>(data: Uint8Array, functions: Array<Unserializer>): T {
  const result = unserializeGenericSub(data, functions, 0);

  if (result.newOffset !== data.length)
    throw new InternalError(`deserialization error: trailing garbage data (unserialized cursor: ${result.newOffset}, buffer length: ${data.length})`);

  return ((result.value: any): T);
}

export function unserializeList(data: Uint8Array, f: Unserializer, offset: number, name: string = 'value') {
  let newOffset = offset;

  const len = varint.decode(data, newOffset);
  newOffset += varint.decode.bytes;

  const result = [];
  for (let i = 0; i < len; ++i) {
    let value;
    ({ value, newOffset } = f(data, newOffset));
    result.push(value);
  }

  return { [name]: result, newOffset };
}

export function encodeArrayLength(array: Uint8Array | Array<number>): Uint8Array {
  return new Uint8Array(varint.encode(array.length));
}

export function encodeListLength(array: $ReadOnlyArray<any>): Uint8Array {
  return new Uint8Array(varint.encode(array.length));
}
