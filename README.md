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

[identity_npm-badge]: https://img.shields.io/npm/v/@tanker/identity.svg
[identity_npm-link]: https://npmjs.com/package/@tanker/identity

[fakeauth_npm-badge]: https://img.shields.io/npm/v/@tanker/fake-authentication.svg
[fakeauth_npm-link]: https://npmjs.com/package/@tanker/fake-authentication

[filekit_npm-badge]: https://img.shields.io/npm/v/@tanker/filekit.svg
[filekit_npm-link]: https://npmjs.com/package/@tanker/filekit

[verificationui_npm-badge]: https://img.shields.io/npm/v/@tanker/verification-ui.svg
[verificationui_npm-link]: https://npmjs.com/package/@tanker/verification-ui

<a href="#readme"><img src="./src/public/tanker.png" alt="Tanker logo" width="180" /></a>

[![License][license-badge]][license-link]
[![Build][travis-badge]][travis-link]
[![BrowserStack Status][browserstack-badge]][browserstack-link]
[![Coverage][codecov-badge]][codecov-link]
[![Last Commit][last-commit-badge]][last-commit-link]

# Encryption SDKs for JavaScript

[Overview](#overview) · [Packages](#packages) · [Usage example](#usage-example) · [Documentation](#documentation) · [Release notes](#release-notes) · [Browser support](#browser-support) · [Contributing](#contributing) · [License](#license)

## Overview

Tanker is an open-source solution to protect sensitive data in any application, with a simple end-user experience and good performance. No cryptographic skills are required to implement it.

## Tanker FileKit

Tanker **FileKit** is a turnkey solution to implement client-side encrypted file sharing in your application easily.

It wraps Tanker **Client** and Tanker **VerificationUI** in a single easy-to-use to use package.


<details><summary>Tanker FileKit usage example</summary>

This is a simple example using FileKit and Fake Authentication.

```javascript
import FileKit from '@tanker/filekit';
import FakeAuth from '@tanker/fake-authentication';

const fileKit = new FileKit({trustchainId: appId});
const FakeAuth = new FakeAuth(appId);

const email = 'roberta@scaffold.ia';
const { privateIdentity, privateProvisionalIdentity } = await FakeAuth.getPrivateIdentity(email);

// it starts a verification UI
await fileKit.start(email, privateIdentity, privateProvisionalIdentity);
// your FileKit is ready here


// upload
const resourceId = await fileKit.upload(file, {shareWithUsers, shareWithGroups});

// download
await fileKit.download(resourceId);
```

</details>

| Package | Version |
|:--------|:--------|
| [@tanker/filekit][filekit_npm-link]    | [![filekit_npm-badge]][filekit_npm-link]   |

## Tanker Client

Tanker **Client** is the foundation, it provides powerful **client-side encryption** of any type of data, textual or binary.

| Package | Version |
|:--------|:--------|
| [@tanker/client-browser][browser_npm-link] | [![browser_npm-badge]][browser_npm-link] |
| [@tanker/client-node][nodejs_npm-link]    | [![nodejs_npm-badge]][nodejs_npm-link]   |

Detailed changes for each release are documented in the [Release Notes](https://github.com/TankerHQ/sdk-js/releases).

<details><summary>Tanker Client usage example</summary>

The client SDK takes care of all the difficult cryptography in the background, leaving you with simple high-level APIs:

```javascript
import { Tanker } from '@tanker/client-browser';

// Init the isolated Tanker environment within your application
const tanker = new Tanker({ trustchainId: '...' });

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

The client SDK automatically handles complex key exchanges, cryptographic operations, and identity verification for you.
</details>

For more details and advanced examples, please refer to:

* [Client SDK implementation guide](https://docs.tanker.io/latest/guide/basic-concepts/)
* [Client API reference](https://docs.tanker.io/latest/api/tanker/)
* [Client SDK product overview](https://tanker.io/product)

Or fiddle with the [quickstart examples](https://github.com/TankerHQ/quickstart-examples) to see the Tanker SDKs integrated in a collection of demo apps.


## Identity management

End-to-end encryption requires that all users have cryptographic identities. The following packages help to handle them:

Tanker **Identity** is a server side package to link Tanker Identities with your users in your application backend.
It is available in many languages. This repository only contains the Javascript version.

Tanker **Verification UI** is a UI element that wraps a Tanker **Client** in order to handle the verification process on its own. It takes the form of a modal that will appear as needed, send the verification code by email to the user and prompt them to verify their identity with the code.

Tanker **Fake Authentication** reduces the friction when starting new projects, by delaying the integration of Tanker Identity in your application server.

| Package | Version |
|:--------|:--------|
| [@tanker/fake-authentication][fakeauth_npm-link]    | [![fakeauth_npm-badge]][fakeauth_npm-link]   |
| [@tanker/verification-ui][verificationui_npm-link]    | [![verificationui_npm-badge]][verificationui_npm-link]   |
| [@tanker/identity][identity_npm-link]    | [![identity_npm-badge]][identity_npm-link]   |


## Other platforms

Tanker can be integrated in cross-platform applications, all working with the same resources.

To use Tanker in your **mobile applications**, use our open-source **[iOS](https://github.com/TankerHQ/sdk-ios)** and **[Android](https://github.com/TankerHQ/sdk-android)** SDKs.




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
