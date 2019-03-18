# Identity SDK

Tanker Identity generation in JavaScript for the [Tanker SDK](https://tanker.io/docs/latest).

## Installation

The preferred way of using the component is via NPM:

```bash
npm install --save @tanker/identity
```

## Usage

The server-side code below demonstrates a typical flow to safely deliver identities to your users:

```javascript
import { createIdentity } from '@tanker/identity';

// Store these configurations in a safe place
const trustchainId = '<trustchain-id>';
const trustchainPrivateKey = '<trustchain-private-key>';

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
    identity = await createIdentity(trustchainId, trustchainPrivateKey, userId);

    // Store the newly generated user identity
    storeUserIdentity(userId, identity);
  }

  // From now, the same user identity will always be returned to a given user
  return identity;
}
```

Read more about user *identity* in the [Tanker guide](https://tanker.io/docs/latest/guide/server/).
