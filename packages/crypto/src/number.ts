/* eslint-disable no-bitwise */

type ByteSize = 1 | 2 | 4 | 8;

export const uint32ByteSize = 4;

export const uint64ByteSize = 8;

// Knowing that operands of binary operators are converted to signed 32-bit
// integers in two's complement format, we must only use them on positive
// integers lower than:
const MAX_BINARY_SAFE_INTEGER = 2 ** 31 - 1;

function toUintle(value: number, byteSize: ByteSize): Uint8Array {
  if (typeof value !== 'number' || value !== value) // eslint-disable-line no-self-compare
    throw new TypeError(`Expected a valid integer but got ${value}`);

  // Number.MAX_SAFE_INTEGER === (2 ** 53) - 1
  const maxValue = byteSize > 6 ? Number.MAX_SAFE_INTEGER : 2 ** (byteSize * 8) - 1;

  if (value < 0 || value > maxValue)
    throw new TypeError(`Expected a positive integer < ${maxValue} but got ${value}`);

  const bytes = [];
  let current = value;

  while (current > MAX_BINARY_SAFE_INTEGER) {
    bytes.push(current & 0xFF);
    current /= 256;
  }

  do {
    bytes.push(current & 0xFF);
    current >>>= 8;
  } while (current);

  const uint = new Uint8Array(byteSize);
  uint.set(bytes, 0);

  return uint;
}

export function toUint64le(value: number): Uint8Array {
  return toUintle(value, uint64ByteSize);
}

export function toUint32le(value: number): Uint8Array {
  return toUintle(value, uint32ByteSize);
}

// Is the given little endian number <= Number.MAX_SAFE_INTEGER? (i.e. <= 2 ** 53 - 1)
function isSafeLe(value: Uint8Array): boolean {
  if (value.length < 7)
    return true;

  if (value.length === 8 && value[7] !== 0)
    return false;

  // value is 7 or 8 byte long with most significant byte at index 6
  return value[6]! < 32;
}

function fromUintle(value: Uint8Array, byteSize: ByteSize): number {
  if (!(value instanceof Uint8Array))
    throw new TypeError(`Expected a Uint8Array but got ${value}`);

  if (value.length !== byteSize)
    throw new TypeError(`Expected a Uint8Array of length ${byteSize} but had length ${value.length}`);

  if (!isSafeLe(value))
    throw new TypeError('Cannot convert an integer bigger than Number.MAX_SAFE_INTEGER');

  return Array.from(value).reduceRight((acc, elt) => acc * 256 + elt);
}

export function fromUint32le(value: Uint8Array): number {
  return fromUintle(value, uint32ByteSize);
}

export function fromUint64le(value: Uint8Array): number {
  return fromUintle(value, uint64ByteSize);
}
