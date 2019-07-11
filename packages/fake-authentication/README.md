# Tanker Fake Authentication

This package provide a fake user identity server. Given a user id it will return a Tanker private identity to be used with Tanker. It also returns a list of public identities given a list of user ids.
This package aims at reducing the friction when starting new projects, by delaying the integration of Tanker identity in your application server.

**This must not be used in production, user identities would not be protected **

## API

### Construction

```javascript
import FakeAuthentication from '@tanker/fake-authentication';

const fakeAuth = new FakeAuthentication(trustchainId);
```

### Get a private identity

Returns a private identity given a user id. This API is not protected in any way, this is for test only.

Those private identities can be accessed by anyone who knows the user id.

#### With an email
```javascript

const userId = 'cedric@sample.com';
const {privateIdentity, privateProvisionalIdentity} = await fakeAuth.getPrivateIdentity(userId);
```

#### With a user id
```javascript

const userId = 'silvie';
const {privateIdentity, privateProvisionalIdentity} = await fakeAuth.getPrivateIdentity(userId);
```

#### Anonymous

It is possible to generate a user id and use fake authentication with anonymous identities.

```javascript
const userId = uuid.v4();
const {privateIdentity} = await fakeAuth.getPrivateIdentity(userId);
```

#### How to use the returned identity

##### With FileKit

```javascript
// then use it with Tanker or FileKit
filekit.start(email, privateIdentity, privateProvisionalIdentity);
```

##### With Tanker

```javascript
status = tanker.start(privateIdentity);
switch(status) {
  case 'IDENTITY_REGISTRATION_NEEDED': {
    const verifCode = fetchIt(); // TODO
    tanker.registerIdentity(email, verifCode);
    tanker.attachProvisionalIdentity(privateProvisionalIdentity);
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
await verifUI.start(email, privateIdentity, privateProvisionalIdentity);
// tanker is now ready
```

##### With FileKit (Anonymous)

In that case FileKit will start Tanker, register a verificationKey and drop it.

```javascript
await filekit.startAnonymous(privateIdentity);
```

##### With Tanker (Anonymous)
```javascript
// this code could belong to tanker.startAnonymous (it would return the verificationKey)
tanker.start(privateIdentity);
const verificationKey = await tanker.generateVerificationKey()
await tanker.registerIdentity({verificationKey});
// to get back access to the data store the verificationKey and the PrivateIdentity? (to have the userId)

// TO BE WARPED IN:
const verificationKey = await tanker.startAnonymous(privateIdentity);
```

## Get public identities

Returns a array of object including the user_id and the public_identity. The public identities returned will be provisional for userIds that have no identities registered. (when getPrivateIdentity wasn't called for the userId).

```javascript
const userIds = ['alice@sample.io', 'bob@company.com'];
const publicIdentities = await fakeAuth.getPublicIdentities(userIds);

// then use it with Tanker or FileKit
tanker.encrypt(someData, { shareWithUsers: Object.values(publicIdentities) });
filekit.upload(someFile, { shareWith: Object.values(publicIdentities) });
```
