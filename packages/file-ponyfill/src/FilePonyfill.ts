// @ts-nocheck
/* eslint-disable */

import globalThis from '@tanker/global-this';

const { File } = globalThis;
// By default, suppose File doesn't need to be ponyfilled
let FilePonyfill = File;

try {
  // Only try and ponyfill if a previous File class exists (i.e. skip Node.js)
  if (File !== undefined) {
    new File([], '');
  }
} catch (e) {
  // Create a File ponyfill with a working constructor and an ancestry
  // that will look like this: FilePonyfill < File < Blob
  FilePonyfill = function (chunks, name, opts) {
    const blob = new Blob(chunks, opts || {});

    blob.name = name;
    blob.lastModified = opts && opts.lastModified || Date.now();
    blob.lastModifiedDate = new Date(blob.lastModified);

    Object.setPrototypeOf(blob, Object.getPrototypeOf(this));

    return blob;
  };

  const proto = Object.create(File.prototype);
  Object.defineProperty(proto, 'size', Object.getOwnPropertyDescriptor(Blob.prototype, 'size'));
  Object.defineProperty(proto, 'type', Object.getOwnPropertyDescriptor(Blob.prototype, 'type'));
  proto.slice = Blob.prototype.slice || Blob.prototype.mozSlice || Blob.prototype.webkitSlice;
  proto.constructor = FilePonyfill;
  FilePonyfill.prototype = proto;
}

export default FilePonyfill;
