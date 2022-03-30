import type { DecryptionStream, EncryptionStream } from '@tanker/core';
import type { Readable, IWritable } from '@tanker/stream-base';

// copy paste of the same function from core/src/CloudStorage/Manager.js
export const pipeStreams = async <T>(
  { streams, resolveEvent }: { streams: Array<Readable | IWritable>; resolveEvent: string; },
) => new Promise<T>((resolve, reject) => {
  streams.forEach(stream => stream.on('error', reject));
  streams.reduce((leftStream, rightStream) => (leftStream as Readable).pipe(rightStream as IWritable)).on(resolveEvent, resolve);
});

export const watchStream = (stream: EncryptionStream | DecryptionStream) => new Promise<Array<Uint8Array>>((resolve, reject) => {
  const result: Array<Uint8Array> = [];
  stream.on('data', (data: Uint8Array) => result.push(data));
  stream.on('end', () => resolve(result));
  stream.on('error', reject);
});
