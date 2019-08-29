# Tanker FileKit

Tanker **FileKit** is an end-to-end encrypted file storage service for apps.

Tanker **FileKit** transfers and stores files in the cloud. The files are encrypted in the browser before being uploaded, and
can be downloaded only by the owner and recipients, completely transparently.

It wraps Tanker **Core** and Tanker **VerificationUI** in a single easy-to-use to use package.

## Live demo

Here is an example of [what an application built with FileKit can do](https://tankerhq.github.io/filekit-tuto-app/).

![FileKit app example](./src/public/filekit-app.png)

## Getting started

Get started with this tutorial: https://docs.tanker.io/filekit/latest/tutorials/file-transfer/

## Documentation

Our detailed documentation is available [here](https://docs.tanker.io/filekit/latest/).

## Quick Start

You can use Fake Authentication to upload, download and share files without too much configuration:

### Initializing with Fake Authentication and an email

```javascript
import FileKit from '@tanker/filekit';
import FakeAuthentication from '@tanker/fake-authentication';

const fileKit = new FileKit({ appId });
const fakeAuthentication = new FakeAuthentication({ appId });

const email = 'alice@example.com';
const privateIdentity = await fakeAuthentication.getPrivateIdentity(email);

// it starts a verification UI
await fileKit.start(email, privateIdentity);
// your FileKit is ready here
```

## Uploading

```javascript
const fileId = await fileKit.upload(file, { shareWithUsers, shareWithGroups });
```

## Downloading

This will start a file download in the browser:

```javascript
await fileKit.downloadToDisk(fileId);
```

If you need to access the file object in JavaScript:

```javascript
const file = await fileKit.download(fileId);
```

## Alternative initialization methods

### Initializing with Fake Authentication and an anonymous disposable session

```javascript
import FileKit from '@tanker/filekit';
import FakeAuthentication from '@tanker/fake-authentication';

const fileKit = new FileKit({ appId });
const fakeAuthentication = new FakeAuthentication({ appId });

const privateIdentity = await fakeAuthentication.getPrivateIdentity();
await fileKit.startDisposableSession(privateIdentity);
```

<aside class="note">
Note that a private identity is required to start a disposable session too. It allows the FileKit client to use Tanker.
</aside>

### Initializing in a production application

To use FileKit in a real application, you will need to replace the calls to Fake Authentication to calls to your application server. [See the related Tanker documentation.](https://docs.tanker.io/latest/guide/adapting-server-code/)

