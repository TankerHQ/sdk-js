import type { Readable, IWritable } from '@tanker/stream-base';

// copy paste of the same function from core/src/CloudStorage/Manager.js
export const pipeStreams = async <T>(
  { streams, resolveEvent }: { streams: Array<Readable | IWritable>; resolveEvent: string; },
) => new Promise<T>((resolve, reject) => {
  streams.forEach(stream => stream.on('error', reject));
  streams.reduce((leftStream, rightStream) => (leftStream as Readable).pipe(rightStream as IWritable)).on(resolveEvent, resolve);
});
