// @flow

export default function makeUint8Array(data: string, size: number): Uint8Array {
  if (data.length > size)
    throw new Error('makeUint8Array of incorrect size');

  const buf = new Uint8Array(size);
  for (let i = 0; i < data.length; i++) {
    buf[i] = data.charCodeAt(i);
  }
  return buf;
}

