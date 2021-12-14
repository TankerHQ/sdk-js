/* eslint-disable no-bitwise */
import { DecryptionFailed } from '@tanker/errors';
import { concatArrays } from './utils';

export const minimalPadding = 10;

const myLog2 = (n: number): number => Math.log(n) / Math.log(2);

export const padme = (clearSize: number): number => {
  if (clearSize <= 1)
    return 0;

  const e = Math.floor(myLog2(clearSize));
  const s = Math.floor(myLog2(e)) + 1;
  const lastBits = e - s;
  const bitMask = (1 << lastBits) - 1;
  return (clearSize + bitMask) & ~bitMask;
};

export const getPaddedSize = (clearsize: number) => Math.max(padme(clearsize + 1), minimalPadding);

export const padClearData = (plainText: Uint8Array): Uint8Array => {
  const paddedSize = getPaddedSize(plainText.length);
  const paddingArray = new Uint8Array(paddedSize - plainText.length);
  paddingArray[0] = 0x80;
  return concatArrays(plainText, paddingArray);
};

export const removePadding = (paddedData: Uint8Array): Uint8Array => {
  const index = paddedData.lastIndexOf(0x80);

  if (index === -1 || paddedData.slice(index + 1).findIndex(b => b !== 0x00) !== -1) {
    throw new DecryptionFailed({ message: 'could not remove padding' });
  }

  return paddedData.slice(0, index);
};
