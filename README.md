[license-badge]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-link]: https://opensource.org/licenses/Apache-2.0

[travis-badge]: https://img.shields.io/travis/TankerHQ/sdk-js/master.svg?label=Build
[travis-link]: https://travis-ci.org/TankerHQ/sdk-js

[codecov-badge]: https://img.shields.io/codecov/c/github/TankerHQ/sdk-js.svg?label=Coverage
[codecov-link]: https://codecov.io/gh/TankerHQ/sdk-js

[browserstack-badge]: https://www.browserstack.com/automate/badge.svg?badge_key=emFtQUNqYi9od0o0OU5sLzNQcnNWeGg2aFNMaVIzdUVNQmZoUWRUWC9zYz0tLUVBNTZVTXQ5bGNmVlVMYXZPeUFZTHc9PQ==--ab4016ef79dd30d494dfdf6b09c7810219cae0e1
[browserstack-link]: https://www.browserstack.com/automate/public-build/emFtQUNqYi9od0o0OU5sLzNQcnNWeGg2aFNMaVIzdUVNQmZoUWRUWC9zYz0tLUVBNTZVTXQ5bGNmVlVMYXZPeUFZTHc9PQ==--ab4016ef79dd30d494dfdf6b09c7810219cae0e1

[last-commit-badge]: https://img.shields.io/github/last-commit/TankerHQ/sdk-js.svg?label=Last%20commit&logo=github
[last-commit-link]: https://github.com/TankerHQ/sdk-js/commits/master

[browser_npm-badge]: https://img.shields.io/npm/v/@tanker/client-browser.svg
[browser_npm-link]: https://npmjs.com/package/@tanker/client-browser

[nodejs_npm-badge]: https://img.shields.io/npm/v/@tanker/client-node.svg
[nodejs_npm-link]: https://npmjs.com/package/@tanker/client-node

<a href="#readme"><img src="./src/public/tanker.png" alt="Tanker logo" width="180" /></a>

[![License][license-badge]][license-link]
[![Build][travis-badge]][travis-link]
[![BrowserStack Status][browserstack-badge]][browserstack-link]
[![Coverage][codecov-badge]][codecov-link]
[![Last Commit][last-commit-badge]][last-commit-link]

# Encryption SDK for JavaScript

[Overview](#overview) · [Packages](#packages) · [Usage example](#usage-example) · [Documentation](#documentation) · [Release notes](#release-notes) · [Browser support](#browser-support) · [Contributing](#contributing) · [License](#license)

## Overview

Tanker is an open-source client SDK that can be embedded in any application.

It leverages powerful **client-side encryption** of any type of data, textual or binary, but without performance loss and assuring a **seamless end-user experience**. No cryptographic skills are required.

## Packages

| Package | Version | Description |
|:--------|:--------|:------------|
| [@tanker/client-browser][browser_npm-link] | [![browser_npm-badge]][browser_npm-link] | Client SDK for **Web applications** |
| [@tanker/client-node][browser_npm-link]    | [![nodejs_npm-badge]][nodejs_npm-link]   | Client SDK for Node.js client applications |

To use Tanker in your **mobile applications**, use our open-source **[iOS](https://github.com/TankerHQ/sdk-ios)** and **[Android](https://github.com/TankerHQ/sdk-android)** SDKs.

## Usage example

The client SDK takes care of all the difficult cryptography in the background, leaving you with simple high-level APIs:

```javascript
import { Tanker } from '@tanker/client-browser';

// Init the isolated Tanker environment within your application
const tanker = new Tanker({ trustchainId: '...' });

// Sign in with the user's cryptographic identity
await tanker.open(aliceUserId, aliceUserToken);

// Encrypt data and share it with separate recipients or groups
const encryptedMessage = await tanker.encrypt(
  'It is a secret to everybody',
  { shareWithUsers: [bobUserId] }
);

// Decrypt data (or throw if not a legitimate recipient)
const message = await tanker.decrypt(encryptedMessage);
```

The client SDK automatically handles complex key exchanges, cryptographic operations, and identity verification for you.

## Documentation

For more details and advanced examples, please refer to:

* [SDK implementation guide](https://tanker.io/docs/latest/guide/getting-started/)
* [API reference](https://tanker.io/docs/latest/api/tanker/)
* [Product overview](https://tanker.io/product)

Or fiddle with the [quickstart examples](https://github.com/TankerHQ/quickstart-examples) to see the Tanker SDKs integrated in a collection of demo apps.

## Release notes

Detailed changes for each release are documented in the [release notes](https://github.com/TankerHQ/sdk-js/releases).

## Browser support

The JavaScript client SDK supports and is heavily tested on:

* Chrome, Firefox, Safari, Edge, and Internet Explorer 11
* Node.js 8+

## Contributing

We welcome feedback, [bug reports](https://github.com/TankerHQ/sdk-js/issues), and bug fixes in the form of [pull requests](https://github.com/TankerHQ/sdk-js/pulls).

To build the JavaScript client SDK yourself, please follow the steps below.

### Prerequisites

Install [Yarn](https://yarnpkg.com/en/docs/install) version 1.0 or greater.

Use this command to check the Yarn version installed on your system:
```bash
yarn -v
```

### Install dependencies

Clone this repository:
```bash
git clone https://github.com/TankerHQ/sdk-js.git
```

Install dependencies:
```bash
cd sdk-js && yarn
```

### Test and lint

Our codebase uses the following ES6 features: `async` / `await`, `import` / `export`, and classes with flow for type-checking and with eslint for linting.

To check that the code is correct and to launch the tests in Node.js, use:

```bash
yarn proof
```

### Submit your pull request

Before submitting your pull request, please make sure that your changes pass the linters and that all the tests pass on your local machine.

For non-trivial changes, we highly recommend including extra tests.

When you're ready, submit your [pull request](https://github.com/TankerHQ/sdk-js/pulls), targeting the `master` branch of this repository.

### Credits

At Tanker, we happily use [BrowserStack](https://www.browserstack.com/) to automate testing on many browsers.

<img src="./src/public/browserstack.png" alt="BrowserStack logo">

## License

The Tanker JavaScript SDK is licensed under the [Apache License, version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
