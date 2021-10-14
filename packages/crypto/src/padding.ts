/* eslint-disable no-bitwise */
import { DecryptionFailed, InternalError } from '@tanker/errors';
import { concatArrays } from './utils';

export enum Padding {
  AUTO = 'AUTO',
  OFF = 'OFF',
}

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

const computeNextMultiple = (multipleOf: number, biggerThan: number) => multipleOf * Math.ceil(biggerThan / multipleOf);

export const paddedFromClearSize = (clearSize: number, paddingStep?: number | Padding): number => {
  if (paddingStep === undefined || paddingStep === Padding.AUTO) {
    return Math.max(padme(clearSize), minimalPadding) + 1;
  }

  if (paddingStep < 1) {
    throw new InternalError('assertion error: paddingStep should be greater or equal to 1');
  }

  const actualPaddingStep = paddingStep !== Padding.OFF ? paddingStep : 1;

  // Round 0 up to paddingStep (plus the padding byte)
  if (clearSize === 0) {
    return actualPaddingStep + 1;
  }

  return computeNextMultiple(actualPaddingStep, clearSize) + 1;
};

export const padClearData = (plainText: Uint8Array, paddingStep?: number | Padding): Uint8Array => {
  const paddedSize = paddedFromClearSize(plainText.length, paddingStep);
  if (paddedSize < plainText.length + 1)
    throw new InternalError('assertion error: paddedSize is too small');
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

export const isPaddingStep = (paddingStep: unknown): paddingStep is undefined | number | Padding => paddingStep === undefined || (typeof paddingStep === 'number' && paddingStep > 1) || (typeof paddingStep === 'string' && paddingStep in Padding);
