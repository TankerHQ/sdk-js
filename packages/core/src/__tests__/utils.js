// @flow

export function makeBuffer(data: string, size: number): Uint8Array {
  if (data.length > size)
    throw new Error('makeBuffer of incorrect size');

  const buf = new Uint8Array(size);
  for (let i = 0; i < data.length; i++) {
    buf[i] = data.charCodeAt(i);
  }
  return buf;
}

