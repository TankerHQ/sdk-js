# Tanker FileKit

Tanker FileKit is a turnkey solution to implement end-to-end file sharing in your application easily.

It wraps Tanker Storage and Tanker VerificationUi in a simple to use package.

## Initialization with an email

```javascript
import FakeAuth from '@tanker/fake-authentication';
import FileKit from '@tanker/filekit';

const fileKit = new FileKit(appId);
const FakeAuth = new FakeAuth(appId);

const email = 'roberta@scaffold.ia';
const {private_identity, private_provisional_identity} = FakeAuth.getPrivateIdentity(email);

// it starts a verification UI
await fileKit.start(email, private_identity, private_provisional_identity);
// your FileKit is ready here
```

## Initialization with a temporary account

```javascript
import FakeAuth from '@tanker/fake-authentication';
import FileKit from '@tanker/filekit';

const fileKit = new FileKit(appId);
const FakeAuth = new FakeAuth(appId);

const {private_identity} = FakeAuth.getPrivateIdentity();
await fileKit.startWithVerificationKey(private_identity);

// user_id and verificationKey can be discarded / removed from the example
```

## Initialization with an anonymous account

```javascript
import FakeAuth from '@tanker/fake-authentication';
import FileKit from '@tanker/filekit';

const fileKit = new FileKit(appId);
const FakeAuth = new FakeAuth(appId);

// account creation
const {user_id, private_identity} = FakeAuth.getPrivateIdentity();
const verificationKey = await fileKit.startWithVerificationKey(private_identity);

// on another device
const {private_identity} = FakeAuth.getPrivateIdentity(user_id);
await fileKit.startWithVerificationKey(private_identity, verificationKey);
```

## Upload

```javascript
const resourceId = fileKit.upload(file, {shareWithEmails: ['roberto@muscle.com']});
```

## Download

This will start a download in the browser. If you want to have access to the underlying File object, use Tanker Storage directly.

```javascript
await fileKit.download(resourceId);
```


