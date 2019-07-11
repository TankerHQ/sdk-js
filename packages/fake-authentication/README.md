# Tanker Fake Authentication

This package aims at reducing the friction when starting new projects, by delaying the integration of Tanker identity in your application server. It interacts with a Tanker server, that stores private identities. ```getPrivateIdentity``` returns the private identity associated to the provided user id. If it is a new user id a new private identity is created. Those private identities can then be used to start a Tanker session.

```getPublicIdentities``` can be used to return a list of public identities from a list of user ids (missing identities are created on the spot). The returned list can be passed to functions that expect a list of users to share with.

<aside class="warning">
This must not be used in production, user identities are not protected, you must serve them from you application server through an authenticated route.
</aside>

## API

### Construction

```javascript
import FakeAuthentication from '@tanker/fake-authentication';

const fakeAuth = new FakeAuthentication(appId);
```

### Get a private identity

Returns the private identity associated to the provided user id.

#### With an email
```javascript

const userId = 'cedric@sample.com';
const {privateIdentity} = await fakeAuth.getPrivateIdentity(userId);
```

#### With a user id
```javascript

const userId = 'silvie';
const {privateIdentity} = await fakeAuth.getPrivateIdentity(userId);
```

#### With a generated user id

It is possible to ask getPrivateIdentity to generate a user id for you.

```javascript
const {userId, privateIdentity} = await fakeAuth.getPrivateIdentity();
```

#### How to use the returned identity

##### With FileKit

```javascript
await fileKit.start(email, privateIdentity);
```

##### With Tanker

```javascript
const status = await tanker.start(privateIdentity);
switch(status) {
  case 'IDENTITY_REGISTRATION_NEEDED': {
    const verifCode = fetchIt(); // TODO
    tanker.registerIdentity(email, verifCode);
    break;
  }
  case 'IDENTITY_VERIFICATION_NEEDED': {
    const verifCode = fetchIt(); // TODO
    tanker.verifyIdentity(verifCode);
    break;
  }
}
```

##### With the verification UI

```javascript
// tanker.start not needed here. (done by the verif)
const verifUI = new VerificationUI(tanker);
await verifUI.start(email, privateIdentity);
// tanker is now ready
```

##### With FileKit (Anonymous)

In that case FileKit will start Tanker, register a verificationKey and drop it.

```javascript
await filekit.startAnonymous(privateIdentity);
```

##### With Tanker (Anonymous)
```javascript
tanker.start(privateIdentity);
const verificationKey = await tanker.generateVerificationKey()
await tanker.registerIdentity({verificationKey});
// to get back access to the data store the verificationKey and the PrivateIdentity? (to have the userId)

// TO BE ADDED TO TANKER AS SOMETHING LIKE:
const verificationKey = await tanker.startWithVerificationKey(privateIdentity);
```

## Get public identities

Returns an object mapping the user ids to the public identities.

```javascript
const userIds = ['alice@sample.io', 'bob@company.com'];
const publicIdentities = await fakeAuth.getPublicIdentities(userIds);

// then use it with Tanker or FileKit
tanker.encrypt(someData, { shareWithUsers: Object.values(publicIdentities) });
filekit.upload(someFile, { shareWith: Object.values(publicIdentities) });
```
