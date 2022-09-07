[actions-badge]: https://github.com/TankerHQ/sdk-js/actions/workflows/tests.yml/badge.svg
[actions-link]: https://github.com/TankerHQ/sdk-js/actions/workflows/tests.yml

[browser_npm-badge]: https://img.shields.io/npm/v/@tanker/client-browser.svg
[browser_npm-link]: https://npmjs.com/package/@tanker/client-browser

[browserstack-badge]: https://www.browserstack.com/automate/badge.svg?badge_key=emFtQUNqYi9od0o0OU5sLzNQcnNWeGg2aFNMaVIzdUVNQmZoUWRUWC9zYz0tLUVBNTZVTXQ5bGNmVlVMYXZPeUFZTHc9PQ==--ab4016ef79dd30d494dfdf6b09c7810219cae0e1
[browserstack-link]: https://www.browserstack.com/automate/public-build/emFtQUNqYi9od0o0OU5sLzNQcnNWeGg2aFNMaVIzdUVNQmZoUWRUWC9zYz0tLUVBNTZVTXQ5bGNmVlVMYXZPeUFZTHc9PQ==--ab4016ef79dd30d494dfdf6b09c7810219cae0e1

[codecov-badge]: https://img.shields.io/codecov/c/github/TankerHQ/sdk-js.svg?label=Coverage
[codecov-link]: https://codecov.io/gh/TankerHQ/sdk-js

[identity_npm-badge]: https://img.shields.io/npm/v/@tanker/identity.svg
[identity_npm-link]: https://npmjs.com/package/@tanker/identity

[last-commit-badge]: https://img.shields.io/github/last-commit/TankerHQ/sdk-js.svg?label=Last%20commit&logo=github
[last-commit-link]: https://github.com/TankerHQ/sdk-js/commits/master

[license-badge]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-link]: https://opensource.org/licenses/Apache-2.0

[nodejs_npm-badge]: https://img.shields.io/npm/v/@tanker/client-node.svg
[nodejs_npm-link]: https://npmjs.com/package/@tanker/client-node

<a href="#readme"><img src="https://tanker.io/images/github-logo.png" alt="Tanker logo" width="180" /></a>

[![License][license-badge]][license-link]
[![Build][actions-badge]][actions-link]
[![BrowserStack Status][browserstack-badge]][browserstack-link]
[![Coverage][codecov-badge]][codecov-link]
[![Last Commit][last-commit-badge]][last-commit-link]

# Encryption SDKs for JavaScript

[Overview](#overview) · [Core](#tanker-core) · [Identity](#identity-management) · [Browser support](#browser-support) · [Other platforms](#other-platforms) · [Contributing](#contributing) · [License](#license)

## Overview

Tanker is an open-source solution to protect sensitive data in any application, with a simple end-user experience and good performance. No cryptographic skills are required to implement it.

## Tanker Core

Tanker **Core** is the foundation, it provides powerful **end-to-end encryption** of any type of data, textual or binary. Tanker **Core** handles multi-device, identity verification, user groups and pre-registration sharing.

| Package | Version |
|:--------|:--------|
| [@tanker/client-browser][browser_npm-link] | [![browser_npm-badge]][browser_npm-link] |
| [@tanker/client-node][nodejs_npm-link]    | [![nodejs_npm-badge]][nodejs_npm-link]   |

Detailed changes for each release are documented in the [Release Notes](https://github.com/TankerHQ/sdk-js/releases).

<details><summary>Tanker Core usage example</summary>

The Core SDK takes care of all the difficult cryptography in the background, leaving you with simple high-level APIs:

```javascript
import { Tanker } from '@tanker/client-browser';

// Initialize the isolated Tanker environment within your application
const tanker = new Tanker({ appId: '...' });

// Start a session with the user's cryptographic identity
await tanker.start(aliceIdentity);

// Encrypt data and share it with separate recipients or groups
const encryptedMessage = await tanker.encrypt(
  "It's a secret to everybody",
  { shareWithUsers: [bobIdentity] }
);

// Decrypt data (or throw if not a legitimate recipient)
const message = await tanker.decrypt(encryptedMessage);
```

The Core SDK automatically handles complex key exchanges, cryptographic operations, and identity verification for you.
</details>

For more details and advanced examples, please refer to:

* [Core SDK implementation guide](https://docs.tanker.io/latest/guides/)
* [Core API reference](https://docs.tanker.io/latest/api/core/js/)

Or fiddle with the [quickstart examples](https://github.com/TankerHQ/quickstart-examples) to see the Tanker SDKs integrated in a collection of demo apps.

## Identity management

End-to-end encryption requires that all users have cryptographic identities. The following packages help to handle them:

Tanker **Identity** is a server side package to link Tanker identities with your users in your application backend.
It is available in multiple languages. This repository only contains the Javascript version.

| Package | Version |
|:--------|:--------|
| [@tanker/identity][identity_npm-link]    | [![identity_npm-badge]][identity_npm-link]   |

## Browser support

The Tanker JavaScript SDKs support the following platforms:

* Chrome, Firefox, Safari, Microsoft Edge, and Internet Explorer 11
* Node.js 14+

The Tanker JavaScript SDKs are constantly tested with all of the supported browsers via unit and functional tests.

We use [BrowserStack](https://www.browserstack.com/) to automate testing on many browser & OS combinations.

<img src="./src/public/browserstack.png" alt="BrowserStack logo">

## Other platforms

Tanker is also available for your **mobile applications**: use our open-source **[iOS](https://github.com/TankerHQ/sdk-ios)** and **[Android](https://github.com/TankerHQ/sdk-android)** SDKs.

## Contributing

We welcome feedback, [bug reports](https://tanker.atlassian.net/servicedesk/customer/portals), and bug fixes in the form of [pull requests](https://github.com/TankerHQ/sdk-js/pulls).

To build the JavaScript SDKs yourself, please follow the steps below.

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

Our codebase uses the following ES6 features: `async` / `await`, `import` / `export`, and classes with typescript for type-checking and with eslint for linting.

To check that the code is correct and to launch the tests in Node.js, use:

```bash
yarn proof
```

### Submit your pull request

Before submitting your pull request, please make sure that your changes pass the linters and that all the tests pass on your local machine.

For non-trivial changes, we highly recommend including extra tests.

When you're ready, submit your [pull request](https://github.com/TankerHQ/sdk-js/pulls), targeting the `master` branch of this repository.

## License

The Tanker JavaScript SDK is licensed under the [Apache License, version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
