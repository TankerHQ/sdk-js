[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Build](https://img.shields.io/travis/SuperTanker/sdk-js/master.svg)](https://travis-ci.org/SuperTanker/sdk-js)

# Tanker JavaScript SDK

## Table of Contents

 * [Overview](#overview)
 * [Setup](#setup)
 * [Contributing](#contributing)
 * [Documentation](#documentation)
 * [License and Terms](#license-and-terms)

## Overview

[The Tanker SDK](https://tanker.io) provides an easy-to-use SDK allowing you to protect your users' 
data. 

The Tanker SDK consists of the following packages, which are distributed on npm:

* `@tanker/client-browser` for Web applications
* `@tanker/client-node` for Node.js client applications


For more information about usage, visit the
[Tanker SDK guide](https://tanker.io/docs/latest/guide/getting-started/).


## Setup

If you want to build the Tanker SDK yourself, follow these steps:

### Prerequisites

Install [Yarn](https://yarnpkg.com/en/docs/install) version 1.0 or greater.  

Use this command to check the Yarn version installed on your system:
```bash
yarn -v
```

### Install dependencies

Clone this repository:
```bash
git clone https://github.com/SuperTanker/sdk-js.git
```

Install dependencies:
```bash
cd sdk-js && yarn
```

### Test and lint

Our codebase is using the following ES6 features: async/await, import/export, and classes with flow for type-checking and with eslint for linting.  

To check that the code is correct and launch the tests, use:

```bash
yarn proof
```

## Contributing

We welcome feedback, bug reports and bug fixes in the form of pull requests.   

Please make sure that your changes pass the linters and that all the tests pass on your local machine.  

Most non-trivial changes should include some extra tests.

## Documentation

* [Guide](https://tanker.io/docs/latest/guide/getting-started/)
* [API Documentation](https://tanker.io/docs/latest/api/tanker/)
* [Changelog](https://tanker.io/docs/latest/changelog/)


## License and Terms

The Tanker Javascript SDK is licensed under the
[Apache License, version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
