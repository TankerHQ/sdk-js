# A cross-browser polyfill for File

A well known issue with the JavaScript `File` class is the lack of [a constructor](https://developer.mozilla.org/en-US/docs/Web/API/File/File) in [some browsers](https://developer.mozilla.org/en-US/docs/Web/API/File/File#Browser_compatibility):

```javascript
new File(['Hi!'], 'file.txt'); // will throw in Edge and Internet Explorer
```

Using feature detection, this package will either expose a `File` polyfill in browsers lacking a proper constructor, or the native `File` class in others.

You can safely use this package as a drop-in replacement for the native `File` class in all browsers, e.g.:

```javascript
import FilePolyfill from '@tanker/file-polyfill';

// Get bits from whatever method you want, using fetch() as an example
const response = await fetch('https://your.server.com/path/to/a/dummy.pdf');
const bits = [await response.arrayBuffer()];

// Construct a file in a cross-browser fashion
const file = new FilePolyfill(bits, 'dummy.pdf', { type: 'application/pdf' });

// Check what we've got
file instanceof window.Blob; // true
file instanceof window.File; // true
file instanceof FilePolyfill; // true
file.name; // 'dummy.pdf'
file.type; // 'application/pdf'
file.size; // the size of dummy.pdf
```

Note that the polyfill is built with a clever class hierarchy so that instances will appear as regular `File` and `Blob` instances, that can be used with `FileReader` and other APIs working with files.

Sponsored by [Tanker](https://tanker.io).
