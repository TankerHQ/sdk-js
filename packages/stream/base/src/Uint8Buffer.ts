import { InvalidArgument } from '@tanker/errors';

export default class Uint8Buffer {
  _arrays: Array<Uint8Array> = [];
  _byteSize: number = 0;

  byteSize(): number {
    return this._byteSize;
  }

  push(array: Uint8Array) {
    if (array.length) {
      this._arrays.push(array);
      this._byteSize += array.length;
    }
  }

  consume(expectedSize: number): Uint8Array {
    if (expectedSize > this._byteSize) {
      throw new InvalidArgument(`Requested ${expectedSize} bytes but had only ${this._byteSize} bytes to consume`);
    }

    const result = new Uint8Array(expectedSize);
    let remaining = expectedSize;
    const memCopy = (dst, src) => {
      dst.set(src, expectedSize - remaining);
      remaining -= src.length;
    };

    while (remaining > 0) {
      const array = this._arrays.shift();
      if (array.length <= remaining) {
        memCopy(result, array);
      } else {
        const subArray = array.subarray(0, remaining);
        memCopy(result, subArray);

        this._arrays.unshift(array.subarray(subArray.length));
      }
    }

    this._byteSize -= expectedSize;

    return result;
  }
}
