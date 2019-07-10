// @flow
import { expect } from 'chai';
import uuid from 'uuid';
import { getPublicIdentity } from '@tanker/identity';
import FakeAuthentication from '../FakeAuthentication';
import 'isomorphic-fetch';

const appId = 'qzORKAdxrYC/7mSeYTWsPMJkiyv1Vu61n5F/REvtUSk=';
// Trustchain private key pPXe1C6qKFQwhh+er3N69nRt6797Rr2tPLglh2Qpfx4uCic14VMAmNukfs9CbBZ205Z0PrUHBk5RCNdYCwF13g==

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
    const ourUserId = uuid.v4();

    const { userId, privateIdentity } = await fa.getPrivateIdentity(ourUserId);

    expect(userId).to.equal(ourUserId);
    expect(privateIdentity).to.exist;
  });

  it('Generates user ids', async () => {
    const fa = new FakeAuthentication(appId);

    const userId = fa.generateUserId();

    expect(userId).to.exist;
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
    const publicUserIdentities = await fa.getPublicIdentities([userId1, userId2]);
    const privUser2 = await fa.getPrivateIdentity(userId2);
    expect(dec(publicUserIdentities[0])).to.deep.equal(dec(await getPublicIdentity(privUser1.privateIdentity)));
    expect(dec(publicUserIdentities[1])).to.equal(dec(await getPublicIdentity(privUser2.privateProvisionalIdentity)));
  });

  it('returns a public identities after a provisional has been taken', async () => {
    const fa = new FakeAuthentication(appId);
    const userId = uuid.v4();

    const publicProvUserIdentities = await fa.getPublicIdentities([userId]);
    const privateUserIdentity = await fa.getPrivateIdentity(userId);
    const publicPermUserIdentities = await fa.getPublicIdentities([userId]);

    expect(privateUserIdentity.userId).to.equal(userId);
    expect(dec(publicProvUserIdentities[0])).to.equal(dec(await getPublicIdentity(privateUserIdentity.privateProvisionalIdentity)));
    expect(dec(publicPermUserIdentities[0])).to.equal(dec(await getPublicIdentity(privateUserIdentity.privateIdentity)));
  });
});
