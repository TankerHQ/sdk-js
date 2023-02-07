# A promisified FileReader for browsers

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![NPM Package](https://img.shields.io/npm/v/@tanker/file-reader.svg)](http://npmjs.org/package/@tanker/file-reader)
![Minified Size](https://img.shields.io/bundlephobia/minzip/@tanker/file-reader.svg)

A promisified `FileReader` implementation very similar to the [browser's FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader), with a few differences:

* the File or Blob instance is given at construction time;
* all `readAs...` methods don't take a Blob or File instance as first argument anymore;
* all `readAs...` methods return a Promise that can be awaited;
* reading in chunks is easy as:
    * you just need to await the next chunk (no event / callback API anymore);
    * the current reading position is automatically tracked.

## Usage

```javascript
import FileReader from '@tanker/file-reader';

// Retrieve a file or blob somehow
const file = new File(
  ['The quick brown fox jumps over the lazy dog'],
  'fox.txt',
  { type: 'plain/text' }
);

// Create your file reader
const reader = new FileReader(file);

// Read the whole file
const text = await reader.readAsText('UTF-8');
const dataUrl = await reader.readAsDataURL();
const arrayBuffer = await reader.readAsArrayBuffer();

// Or read binary chunks (ArrayBuffer)
const chunkSize = 8; // bytes
let chunk;
do {
  chunk = await reader.readAsArrayBuffer(chunkSize);
  // do something with the chunk
} while (chunk.byteLength > 0);
```

## About Tanker

This package is a dependency of the Tanker client SDKs for end-to-end encryption:

* [@tanker/client-browser](https://www.npmjs.com/package/@tanker/client-browser) for Web applications
* [@tanker/client-node](https://www.npmjs.com/package/@tanker/client-node) for Node.js client applications

Read the [documentation](https://docs.tanker.io/latest/) to get started.
