// @flow

import varint from 'varint';

export type ParseResult<T> = {
  value: T,
  newOffset: number,
};

export function setUint32(v: number, buf: Uint8Array, offset: number = 0): number {
  const chunkView = new DataView(buf.buffer, offset, 4);
  chunkView.setUint32(0, v, true);

  return offset + 4;
}

export function getUint32(buf: Uint8Array, offset: number = 0): ParseResult<number> {
  const view = new DataView(buf.buffer, offset, 4);

  return { value: view.getUint32(0, true), newOffset: offset + 4 };
}

export function setArray(src: Uint8Array, dest: Uint8Array, offset: number): number {
  let pos = offset;
  varint.encode(src.length, dest, pos);
  pos += varint.encode.bytes;
  dest.set(src, pos);
  pos += src.length;
  return pos;
}

export function setVarint(src: number, dest: Uint8Array, offset: number): number {
  varint.encode(src, dest, offset);
  return offset + varint.encode.bytes;
}

export function getVarint(src: Uint8Array, offset: number): ParseResult<number> {
  const value = varint.decode(src, offset);
  return { value, newOffset: offset + varint.decode.bytes };
}

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

export function getStaticArray(buf: Uint8Array, size: number, offset: number = 0, name: string = 'value'): Object {
  if (offset + size > buf.length)
    throw new Error('Out of bounds read in getStaticArray');
  const arr = new Uint8Array(buf.subarray(offset, offset + size)); // don't use slice, doesn't work on IE11
  return { [name]: arr, newOffset: offset + size };
}

export function concatArrays(...arrays: Array<Uint8Array | Array<number>>): Uint8Array {
  const totalSize = arrays.reduce((acc, elem) => acc + elem.length, 0);

  const ret = new Uint8Array(totalSize);
  let offset = 0;
  arrays.forEach(elem => {
    if (elem instanceof Uint8Array)
      ret.set(elem, offset);
    else
      ret.set(new Uint8Array(elem), offset);
    offset += elem.length;
  });
  return ret;
}

export function unserializeGenericSub(data: Uint8Array, functions: Array<Function>, offset: number, name: string = 'value'): Object {
  let newOffset = offset;
  let result = {};
  for (const f of functions) {
    let value;
    ({ newOffset, ...value } = f(data, newOffset)); // eslint-disable-line prefer-const
    result = { ...result, ...value };
  }

  return { [name]: result, newOffset };
}

export function unserializeGeneric<T>(data: Uint8Array, functions: Array<Function>): T {
  const result = unserializeGenericSub(data, functions, 0);

  if (result.newOffset !== data.length)
    throw new Error(`deserialization error: trailing garbage data (unserialized cursor: ${result.newOffset}, buffer length: ${data.length})`);

  return ((result.value: any): T);
}

export function unserializeList(data: Uint8Array, f: Function, offset: number, name: string = 'value') {
  let newOffset = offset;

  const len = varint.decode(data, newOffset);
  newOffset += varint.decode.bytes;

  const result = [];
  for (let i = 0; i < len; ++i) {
    let value;
    ({ value, newOffset } = f(data, newOffset)); // eslint-disable-line prefer-const
    result.push(value);
  }

  return { [name]: result, newOffset };
}

export function encodeArrayLength(array: Uint8Array | Array<number>): Uint8Array {
  return new Uint8Array(varint.encode(array.length));
}

export function encodeListLength(array: Array<any>): Uint8Array {
  return new Uint8Array(varint.encode(array.length));
}

export function serializeArrays(...arrays: Array<Uint8Array>): Uint8Array {
  return concatArrays(...arrays.reduce(
    (acc, elem) => [...acc, encodeArrayLength(elem), elem],
    []
  ));
}
