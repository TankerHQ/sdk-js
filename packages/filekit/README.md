# Tanker FileKit

Tanker FileKit is a turnkey solution to implement client-side encrypted file sharing in your application easily.

It wraps Tanker Client and Tanker VerificationUI in a single easy-to-use to use package.


## Quick Start using Fake Authentication


### Initializing with an email

```javascript
import FileKit from '@tanker/filekit';
import FakeAuth from '@tanker/fake-authentication';

const fileKit = new FileKit({trustchainId});
const fakeAuth = new FakeAuth(trustchainId);

const email = 'roberta@scaffold.ia';
const { privateIdentity, privateProvisionalIdentity } = await fakeAuth.getPrivateIdentity(email);

// it starts a verification UI
await fileKit.start(email, privateIdentity, privateProvisionalIdentity);
// your FileKit is ready here
```

### Initializing an anonymous disposable session

```javascript
import FileKit from '@tanker/filekit';
import FakeAuth from '@tanker/fake-authentication';

const fileKit = new FileKit({trustchainId});
const fakeAuth = new FakeAuth(trustchainId);

const { privateIdentity } = await fakeAuth.getDisposablePrivateIdentity();
await fileKit.startDisposableSession(privateIdentity);
```

<aside class="note">
Note that a privateIdentity is still required, it authorizes the FileKit client to use Tanker.
</aside>

## Authentication

To make a real application, you will need to replace the calls to Fake Authentication to calls to your application server. [See the related Tanker documentation.](https://docs.tanker.io/latest/guide/adapting-server-code/)

## Uploading

```javascript
const resourceId = await fileKit.upload(file, {shareWithUsers, shareWithGroups});
```

## Downloading

This will start a download in the browser. If you want to have access to the underlying File object, use ```Tanker.download()``` directly.

```javascript
await fileKit.download(resourceId);
```
