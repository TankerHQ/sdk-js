# Tanker Fake Authentication

This package aims at reducing the friction when starting new projects, by delaying the integration of [Tanker Identity](https://github.com/TankerHQ/sdk-js/tree/master/packages/identity) in your application server. It interacts with a Tanker server, that stores private identities.

<aside class="warning">
Note that this package must not be used in production because the returned private identities are not protected. In a production application, your application server should only return private identities through an authenticated route.
</aside>

## API

### Construction

```javascript
import FakeAuthentication from '@tanker/fake-authentication';

const fakeAuth = new FakeAuthentication({ appId });
```

### Get a private identity

`getPrivateIdentity()` returns the private identity associated with the provided email. If the email does not exist, a new private identity is created and stored for reuse. It is guaranteed that this function will always return the same private identity given an email.

If `getPublicIdentities()` was called before `getPrivateIdentity()` for a given email, the private identity returned by `getPrivateIdentity()` also contains a provisional identity. This provisional identity may have been used to share with that email before it was registered with Tanker. Note that the provisional identity must be associated with the private identity (either automatically with FileKit, VerificationUI or using `attachProvisionalIdentity()`) to enable access to the resources shared with the provisional identity.

```javascript
const email = 'alice@example.com';
const privateIdentity = await fakeAuth.getPrivateIdentity(email);
```

### Get public identities

`getPublicIdentities()` returns an array of public identities from an array of emails. The order of the returned public identities is guaranteed to match the order of the provided emails.

```javascript
const emails = ['alice@example.com', 'bob@company.com'];
const publicIdentities = await fakeAuth.getPublicIdentities(emails);

// then use it with Tanker or FileKit
await tanker.encrypt(someData, { shareWithUsers: publicIdentities });
await fileKit.upload(someFile, { shareWithUsers: publicIdentities });
```

## How to use Tanker Fake Authentication

### Fake Authentication with FileKit

```javascript
const email = 'alice@example.com';

const privateIdentity = await fakeAuth.getPrivateIdentity(email);

await fileKit.start(email, privateIdentity);
```

### Fake Authentication with FileKit (Anonymous disposable session)

In that case FileKit will start a disposable Tanker session. The session will work only once and on a single device.

```javascript
const disposablePrivateIdentity = await fakeAuth.getPrivateIdentity(/* no email */);

await fileKit.startDisposableSession(disposablePrivateIdentity);
```

### Fake Authentication with Tanker

```javascript
const email = 'alice@example.com';
const privateIdentity = await fakeAuth.getPrivateIdentity(email);
const { permanentIdentity, provisionalIdentity } = privateIdentity;

const status = await tanker.start(permanentIdentity);
switch(status) {
  case 'IDENTITY_REGISTRATION_NEEDED': {
    const verificationCode = await promptUserInput(); // See @tanker/identity
    await tanker.registerIdentity({ email, verificationCode });
    await tanker.attachProvisionalIdentity(provisionalIdentity);
    break;
  }
  case 'IDENTITY_VERIFICATION_NEEDED': {
    const verificationCode = await promptUserInput(); // See @tanker/identity
    await tanker.verifyIdentity({ email, verificationCode });
    break;
  }
}
```

### Fake Authentication using the verification UI

```javascript
const email = 'alice@example.com';
const privateIdentity = await fakeAuth.getPrivateIdentity(email);
const { permanentIdentity, provisionalIdentity } = privateIdentity;

const tanker = new Tanker(config);

// The verification UI will start Tanker
const verificationUI = new VerificationUI(tanker);
await verificationUI.start(email, permanentIdentity, provisionalIdentity);
// Once start is done, Tanker is in a ready state
```
