import { random } from '@tanker/crypto';

// Overcome random()'s max size by generating bigger Uint8Arrays
// having a random segment of 1kB set at a random position.
export const makeRandomUint8Array = (sizeOfData: number) => {
  const sizeOfRandomSegment = 1024; // 1kB

  if (sizeOfData < sizeOfRandomSegment)
    return random(sizeOfData);

  const randomSegment = random(sizeOfRandomSegment);
  const data = new Uint8Array(sizeOfData);
  const randomPos = Math.floor(Math.random() * (sizeOfData - sizeOfRandomSegment));
  data.set(randomSegment, randomPos);
  return data;
};
