// @noflow
/* eslint-disable */

const __global = (() => {
  if (typeof window !== 'undefined')
    return window;

  if (typeof WorkerGlobalScope !== 'undefined')
    return self;

  if (typeof global !== 'undefined')
    return global;

  return Function('return this;')();
})();

const { File } = __global;

// By default, suppose File doesn't need to be polyfilled
let FilePolyfill = File;

try {
  // Only try and polyfill if a previous File class exists (i.e. skip Node.js)
  if (File !== undefined) {
    new File([], '');
  }
} catch (e) {
  // Create a File polyfill with a working constructor and an ancestry
  // that will look like this: FilePolyfill < File < Blob
  FilePolyfill = function (chunks, name, opts) {
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
  proto.constructor = FilePolyfill;
  FilePolyfill.prototype = proto;
}

export default FilePolyfill;
