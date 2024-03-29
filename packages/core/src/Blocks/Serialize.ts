import varint from 'varint';
import { InternalError } from '@tanker/errors';
import { utils } from '@tanker/crypto';

type Unserializer = (src: Uint8Array, offset: number) => { newOffset: number; [name: string]: any; };

export function getArray(src: Uint8Array, offset: number, name: string = 'value'): Record<string, any> {
  let pos = offset;
  const len = varint.decode(src, pos);
  pos += varint.decode.bytes!;
  const buffer = new Uint8Array(src.buffer, src.byteOffset + pos, len);
  pos += len;
  return { [name]: buffer, newOffset: pos };
}

export function getString(src: Uint8Array, offset: number, name: string = 'value'): Record<string, any> {
  const result = getArray(src, offset, name);
  return { [name]: utils.toString(result[name]), newOffset: result['newOffset'] };
}

export function setStaticArray(src: Uint8Array, dest: Uint8Array, offset: number = 0): number {
  dest.set(src, offset);
  return offset + src.length;
}

type StaticBool = { [name: string]: boolean; } & { newOffset: number; };
export function getStaticBool(buf: Uint8Array, offset: number = 0, name: string = 'value'): StaticBool {
  if (offset + 1 > buf.length)
    throw new InternalError('Out of bounds read in getStaticBool');
  return { [name]: !!(buf[offset]! & 0x01), newOffset: offset + 1 } as StaticBool; // eslint-disable-line no-bitwise
}

type StaticArray = { [name: string]: Uint8Array; } & { newOffset: number; };
export function getStaticArray(buf: Uint8Array, size: number, offset: number = 0, name: string = 'value'): StaticArray {
  if (offset + size > buf.length)
    throw new InternalError('Out of bounds read in getStaticArray');
  const arr = new Uint8Array(buf.buffer, buf.byteOffset + offset, size);
  return { [name]: arr, newOffset: offset + size } as StaticArray;
}

type UnserializedSub = { [name: string]: Record<string, Uint8Array>; } & { newOffset: number; };
export function unserializeGenericSub(data: Uint8Array, functions: Array<Unserializer>, offset: number, name: string = 'value'): UnserializedSub {
  let newOffset = offset;
  const resultList = [];
  for (const f of functions) {
    const parsedResult = f(data, newOffset);
    resultList.push(parsedResult);
    newOffset = parsedResult.newOffset;
  }

  const result: Record<string, Uint8Array> = Object.assign({}, ...resultList);
  delete result['newOffset'];

  return { [name]: result, newOffset } as UnserializedSub;
}

export function unserializeGeneric<T>(data: Uint8Array, functions: Array<Unserializer>): T {
  const result = unserializeGenericSub(data, functions, 0);

  if (result.newOffset !== data.length)
    throw new InternalError(`deserialization error: trailing garbage data (unserialized cursor: ${result.newOffset}, buffer length: ${data.length})`);

  return result['value'] as unknown as T;
}

export function unserializeList(data: Uint8Array, f: Unserializer, offset: number, name: string = 'value') {
  let newOffset = offset;

  const len = varint.decode(data, newOffset);
  newOffset += varint.decode.bytes!;

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

export function encodeListLength(array: ReadonlyArray<any>): Uint8Array {
  return new Uint8Array(varint.encode(array.length));
}

export function encodeUint32(val: number): Uint8Array {
  const a32 = new Uint32Array(1);
  a32[0] = val;
  const a8 = new Uint8Array(a32.buffer);
  return a8;
}
