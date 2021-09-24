import type { Readable, Writable } from '@tanker/stream-base';

// copy paste of the same function from core/src/CloudStorage/Manager.js
export const pipeStreams = async <T>(
  { streams, resolveEvent }: { streams: Array<Readable | Writable>; resolveEvent: string; },
) => new Promise<T>((resolve, reject) => {
  streams.forEach(stream => stream.on('error', reject));

  // @types/readable-stream is ill-typed. The `pipe()` is part of the interface of Readable
  // see https://nodejs.org/docs/latest-v16.x/api/stream.html#stream_readable_pipe_destination_options
  // We also know that only the first stream is a Readable. Every Other stream is a Transform
  // @ts-expect-error
  streams.reduce((leftStream, rightStream) => leftStream.pipe(rightStream)).on(resolveEvent, resolve);
});
