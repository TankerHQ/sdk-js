# A promisified FileReader for browsers

A promisified `FileReader` implementation very similar to the [browser's FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader), with a few differencies:

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

## License

Developped by [Tanker](https://tanker.io), under the [Apache-2.0](http://www.apache.org/licenses/LICENSE-2.0) license.

Tanker's client SDKs allow for seamless integration of client-side end-to-end encryption in your application.

Tanker is available for iOS, Android, and Web apps.

Read the [documentation](https://tanker.io/docs/latest/) to get started.

Go to [tanker.io](https://tanker.io) for more information about Tanker.
