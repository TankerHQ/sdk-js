# Tanker Fake Authentication

This package aims at reducing the friction when starting new projects, by delaying the integration of [Tanker Identity](https://github.com/TankerHQ/sdk-js/tree/master/packages/identity) in your application server. It interacts with a Tanker server, that stores private identities. ```getPrivateIdentity()``` returns the private identity associated with the provided user id. If the provided user id is new, a private identity is created. Those private identities can be used to start a Tanker session.

```getPublicIdentities()``` can be used to return a list of public identities from a list of user ids. For missing user ids, provisional identities are returned. The returned list can be passed to functions that expect a list of users to share with.

<aside class="warning">
Note that this package must not be used in production because the returned private identities are not protected. In a production application, your application server should only return private identities through an authenticated route.
</aside>

<aside class="note">
Note that all provided user ids are obfuscated before being sent to Tanker.
</aside>

## API

### Construction

```javascript
import FakeAuthentication from '@tanker/fake-authentication';

const fakeAuth = new FakeAuthentication(appId);
```

### Get a private identity

```getPrivateIdentity()``` returns the private identity associated with the provided user id. If the user id does not exists, a new private identity is created and stored for reuse. It is guaranteed that this function will always return the same private identity given a user id.

If ```getPublicIdentities()``` was called before ```getPrivateIdentity()``` for a given user id, a private provisional identity is also returned by ```getPrivateIdentity()```. This provisional identity may have been used to share with that user id before it was registered on Tanker. Note that the provisional identity must be associated with the private identity (either automatically with FileKit, VerificationUI or using ```attachProvisionalIdentity()```) to enable access to the resources shared with the provisional identity, before the user id was registered with Tanker.


#### From an email
```javascript

const userId = 'cedric@sample.com';
const { privateIdentity, privateProvisionalIdentity } = await fakeAuth.getPrivateIdentity(userId);
```

#### From a user id
```javascript

const userId = 'silvie';
const { privateIdentity, privateProvisionalIdentity } = await fakeAuth.getPrivateIdentity(userId);
```

#### Using a generated user id

```generateUserId()``` can be used to create disposable or anonymous identities. In that case no provisional identity will be returned.

```javascript
const userId = fakeAuth.generateUserId();
const { privateIdentity } = await fakeAuth.getPrivateIdentity(userId);
```

### Generate a user id

```generateUserId()``` generates a random user id that can be given to ```getPrivateIdentity()``` to generate disposable or anonymous identities.

```javascript
const userId = await fakeAuth.generateUserId();
```


### Get public identities

```getPublicIdentities()``` returns an array of public identities from an array of user ids. The order of the returned public identities is guaranteed to match the order of the provided user ids.

<aside class="warning">
There is a race condition: if ```getPrivateIdentity()``` has been called but the returned identity is not registered with Tanker yet, ```getPublicIdentities()``` returns the private identity but it won't be usable.
In production a flag is required in your application backend to decide which public identity must be returned for sharing. It should point to the provisional identity until a Tanker session has been successfully started with the private identity at least once.
</aside>

```javascript
const userIds = ['alice@sample.io', 'bob@company.com'];
const publicIdentities = await fakeAuth.getPublicIdentities(userIds);

// then use it with Tanker or FileKit
await tanker.encrypt(someData, { shareWithUsers: publicIdentities });
await fileKit.upload(someFile, { shareWithUsers: publicIdentities });
```


## How to use Tanker Fake Authentication

### Fake Authentication with FileKit

```javascript
const email = 'cedric@sample.com';
const { privateIdentity, privateProvisionalIdentity } = await fakeAuth.getPrivateIdentity(email);

await fileKit.start(email, privateIdentity, privateProvisionalIdentity);
```

### Fake Authentication with FileKit (Anonymous disposable session)

In that case FileKit will start a disposable Tanker session. The session will work only once and on a single device.

```javascript
const {disposablePrivateIdentity} = await fakeAuth.getDisposablePrivateIdentity();

await fileKit.startDisposableSession(disposablePrivateIdentity);
```

### Fake Authentication with Tanker

```javascript
const email = 'cedric@sample.com';
const { privateIdentity, privateProvisionalIdentity } = await fakeAuth.getPrivateIdentity(email);

const status = await tanker.start(privateIdentity);
switch(status) {
  case 'IDENTITY_REGISTRATION_NEEDED': {
    const verificationKey = await fetchItFromYourAppServer(); // See @tanker/identity
    await tanker.registerIdentity({email, verificationKey});
    await tanker.attachProvisionalIdentity(privateProvisionalIdentity);
    break;
  }
  case 'IDENTITY_VERIFICATION_NEEDED': {
    const verificationKey = await fetchItFromYourAppServer(); // See @tanker/identity
    await tanker.verifyIdentity(verificationKey);
    break;
  }
}
```

### Fake Authentication using the verification UI

```javascript
const email = 'cedric@sample.com';
const { privateIdentity, privateProvisionalIdentity } = await fakeAuth.getPrivateIdentity(email);

const tanker = new Tanker(config);

// The verification UI will start Tanker
const verificationUI = new VerificationUI(tanker);
await verificationUI.start(email, privateIdentity, privateProvisionalIdentity);
// Once start is done, Tanker is in a ready state
```

