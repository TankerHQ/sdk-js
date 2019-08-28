# Identity SDK

Tanker Identity generation in JavaScript for the [Tanker SDK](https://docs.tanker.io/latest/).

## Installation

The preferred way of using the component is via NPM:

```bash
npm install --save @tanker/identity
```

## API

```javascript
createIdentity(appId, appSecret, userId);
```

Create a new Tanker identity. This identity is secret and must only be given to a user who has been authenticated by your application. This identity is used by the Tanker client SDK to open a Tanker session.

**appId**<br />
The app ID. You can access it from the [Tanker dashboard](https://dashboard.tanker.io).

**appSecret**<br />
The app secret key. A secret that you have saved right after the creation of your *App*.

**userId**<br />
The ID of a user in your application.
<br /><br />

```javascript
createProvisionalIdentity(appId, email);
```

Create a Tanker provisional identity. It allows you to share a resource with a user who does not have an account in your application yet.

**appId**<br />
The app ID. You can access it from the [Tanker dashboard](https://dashboard.tanker.io).

**email**<br />
The email of the potential recipient of the resource.
<br /><br />

```javascript
getPublicIdentity(tankerIdentity);
```

Return the public identity from an identity. This public identity can be used by the Tanker client SDK to share encrypted resource.

**tankerIdentity**<br />
A Tanker identity.
<br /><br />

```javascript
upgradeUserToken(appId, userId, userToken);
```

Upgrade from a deprecated token used in previous versions of Tanker. Tanker v1 used a user token, when migrating to Tanker v2 you should use this function to migrate you used tokens to identities. This identity is secret and must only be given to a user who has been authenticated by your application. This identity is used by the Tanker client SDK to open a Tanker session.
Note: You probably won't need this API.

**appId**<br />
The app ID. You can access it from the [Tanker dashboard](https://dashboard.tanker.io).

**userId**<br />
The ID of a user in your application.

**userToken**<br />
The Tanker v1 user token.


## Usage

The server-side code below demonstrates a typical flow to safely deliver identities to your users:

```javascript
import { createIdentity } from '@tanker/identity';

// Store these configurations in a safe place
const appId = '<app-id>';
const appSecret = '<app-secret>';

// Example server-side function in which you would implement checkAuth(),
// retrieveUserIdentity() and storeUserIdentity() to use your own authentication
// and data storage mechanisms:
async function getUserIdentity(userId) {
  const isAuthenticated = checkAuth(userId);

  // Always ensure user is authenticated before returning a user identity
  if (!isAuthenticated) {
    throw new Error('unauthorized');
  }

  // Retrieve a previously stored user identity for this user
  let identity = retrieveUserIdentity(userId);

  // If not found, create a new user identity
  if (!identity) {
    identity = await createIdentity(appId, appSecret, userId);

    // Store the newly generated user identity
    storeUserIdentity(userId, identity);
  }

  // From now, the same user identity will always be returned to a given user
  return identity;
}
```

Read more about user *identity* in the [Tanker guide](https://docs.tanker.io/latest/guide/basic-concepts/).
