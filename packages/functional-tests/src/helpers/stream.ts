import { Readable, Writable } from '@tanker/stream-base';

// copy paste of the same function from core/src/CloudStorage/Manager.js
export const pipeStreams = async (
  { streams, resolveEvent }: { streams: Array<Readable | Writable>; resolveEvent: string; },
) => new Promise((resolve, reject) => {
  streams.forEach(stream => stream.on('error', reject));
  streams.reduce((leftStream, rightStream) => leftStream.pipe(rightStream)).on(resolveEvent, resolve);
});
