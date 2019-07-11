// @flow
import { expect } from 'chai';
import uuid from 'uuid';
import { getPublicIdentity } from '@tanker/identity';
import FakeAuthentication from '../FakeAuthentication';
import 'isomorphic-fetch';

const appId = 'TLX6BlK7N1I5KobYP1Jfwm58cfpg1EJZ8+HxUUqrGmM=';

function clean(obj) {
  const propNames = Object.getOwnPropertyNames(obj);
  for (let i = 0; i < propNames.length; i++) {
    const propName = propNames[i];
    if (obj[propName] === null || obj[propName] === undefined) {
      delete obj[propName]; // eslint-disable-line no-param-reassign
    }
  }
}

// this decode a public identities and clean it. (remove empty fields returned by go)
function dec(identity) {
  return clean(JSON.parse(Buffer.from(identity, 'base64').toString('ascii')));
}

describe('FakeAuthentication', () => {
  it('Returns a permanent identity', async () => {
    const fa = new FakeAuthentication(appId);
    const userId = uuid.v4();

    const privateUserIdentity = await fa.getPrivateIdentity(userId);

    expect(privateUserIdentity.user_id).to.equal(userId);
    expect(privateUserIdentity.private_identity).to.exist;
  });

  it('Always returns the same permanent identity', async () => {
    const fa = new FakeAuthentication(appId);
    const userId = uuid.v4();

    const privateUserIdentity = await fa.getPrivateIdentity(userId);
    const privateUserIdentity2 = await fa.getPrivateIdentity(userId);

    expect(privateUserIdentity).to.deep.equal(privateUserIdentity2);
  });

  it('returns a list of public identities (provisional and permanent)', async () => {
    const fa = new FakeAuthentication(appId);
    const userId1 = uuid.v4();
    const userId2 = uuid.v4();

    // userId1 exists, while userId2 is provisional
    const privUser1 = await fa.getPrivateIdentity(userId1);
    const publicUserIdentities = await fa.getUserPublicIdentities([userId1, userId2]);
    const privUser2 = await fa.getPrivateIdentity(userId2);
    expect(dec(publicUserIdentities[userId1])).to.deep.equal(dec(await getPublicIdentity(privUser1.private_identity)));
    expect(dec(publicUserIdentities[userId2])).to.equal(dec(await getPublicIdentity(privUser2.private_provisional_identity)));
  });

  it('returns a public identities after a provisional has been taken', async () => {
    const fa = new FakeAuthentication(appId);
    const userId = uuid.v4();

    const publicProvUserIdentities = await fa.getUserPublicIdentities([userId]);
    const privateUserIdentity = await fa.getPrivateIdentity(userId);
    const publicPermUserIdentities = await fa.getUserPublicIdentities([userId]);

    expect(privateUserIdentity.user_id).to.equal(userId);
    expect(dec(publicProvUserIdentities[userId])).to.equal(dec(await getPublicIdentity(privateUserIdentity.private_provisional_identity)));
    expect(dec(publicPermUserIdentities[userId])).to.equal(dec(await getPublicIdentity(privateUserIdentity.private_identity)));
  });
});
