# Tanker SDK (crypto)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![NPM Package](https://img.shields.io/npm/v/@tanker/crypto.svg)](http://npmjs.org/package/@tanker/crypto)
![Minified Size](https://img.shields.io/bundlephobia/minzip/@tanker/crypto.svg)

This package is a dependency of the Tanker client SDKs for end-to-end encryption:

* [@tanker/client-browser](https://www.npmjs.com/package/@tanker/client-browser) for Web applications
* [@tanker/client-node](https://www.npmjs.com/package/@tanker/client-node) for Node.js client applications

Read the [documentation](https://docs.tanker.io/latest/) to get started.

## Usage

Most functions in this package are synchronous, but you **MUST** ensure the underlying crypto library is ready before calling any of them:

```js
import { ready, toString } from '@tanker/crypto';

const use = () => {
  const bytes = [104, 101, 108, 108, 111];
  const buffer = new Uint8Array(bytes);
  console.log(toString(buffer)); // 'hello'
};

// Either do:
ready.then(use);

// Or:
(async () => {
  await ready;
  use();
})();
```
