# Tanker SDK (crypto)

This package is a dependency of the Tanker client SDKs for end-to-end encryption:

* [@tanker/client-browser](https://www.npmjs.com/package/@tanker/client-browser) for Web applications
* [@tanker/client-node](https://www.npmjs.com/package/@tanker/client-node) for Node.js client applications

## Usage

All functions of this package are synchronous, but you **MUST** ensure the underlying crypto library is ready before calling any of them:

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

## More about Tanker

Tanker's client SDKs allow for seamless integration of client-side end-to-end encryption in your application.

Tanker is available for iOS, Android, and Web apps.

Read the [documentation](https://docs.tanker.io/latest/) to get started.

Go to [tanker.io](https://tanker.io) for more information about Tanker.
