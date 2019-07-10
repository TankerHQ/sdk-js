// @flow
import { getPublicIdentity, _deserializePublicIdentity } from '@tanker/identity';
import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import uuid from 'uuid';

import FakeAuthentication from '../FakeAuthentication';

chai.use(chaiAsPromised);

const makeTestEmail = () => `${uuid.v4()}@example.com`;

const expectMatchingPublicIdentities = (identityA: string, identityB: string) => expect(
  _deserializePublicIdentity(identityA),
).to.deep.equal(
  _deserializePublicIdentity(identityB),
);

describe('FakeAuthentication', () => {
  let fa;

  before(() => {
    // With trustchain private key: pPXe1C6qKFQwhh+er3N69nRt6797Rr2tPLglh2Qpfx4uCic14VMAmNukfs9CbBZ205Z0PrUHBk5RCNdYCwF13g==
    const appId = 'qzORKAdxrYC/7mSeYTWsPMJkiyv1Vu61n5F/REvtUSk=';
    fa = new FakeAuthentication({ appId, url: 'https://dev-fakeauth.tanker.io' });
  });

  it('returns a disposable permanent identity without an email', async () => {
    const privateIdentity = await fa.getPrivateIdentity();
    const { permanentIdentity, provisionalIdentity } = privateIdentity;
    expect(permanentIdentity).to.be.a.string;
    expect(provisionalIdentity).not.to.exist;
  });

  it('returns a permanent identity for the given email', async () => {
    const email = makeTestEmail();
    const privateIdentity = await fa.getPrivateIdentity(email);
    const { permanentIdentity, provisionalIdentity } = privateIdentity;
    expect(permanentIdentity).to.be.a.string;
    expect(provisionalIdentity).not.to.exist;
  });

  it('returns the same permanent identity when requested multiple times', async () => {
    const email = makeTestEmail();

    const result1 = await fa.getPrivateIdentity(email);
    const result2 = await fa.getPrivateIdentity(email);

    expect(result1).to.deep.equal(result2);
  });

  it('returns a list of public identities (provisional and permanent)', async () => {
    const email1 = makeTestEmail();
    const email2 = makeTestEmail();

    // email1 exists, while email2 is provisional
    const priv1 = await fa.getPrivateIdentity(email1);
    const [pub1, pub2] = await fa.getPublicIdentities([email1, email2]);
    const priv2 = await fa.getPrivateIdentity(email2);

    expectMatchingPublicIdentities(pub1, await getPublicIdentity(priv1.permanentIdentity));
    expectMatchingPublicIdentities(pub2, await getPublicIdentity(priv2.provisionalIdentity));
  });

  it('returns the proper public identity before and after the private identity has been used', async () => {
    const email = makeTestEmail();

    const [publicProvIdentity] = await fa.getPublicIdentities([email]);
    const { permanentIdentity, provisionalIdentity } = await fa.getPrivateIdentity(email);
    const [publicPermIdentity] = await fa.getPublicIdentities([email]);

    expectMatchingPublicIdentities(publicProvIdentity, await getPublicIdentity(provisionalIdentity));
    expectMatchingPublicIdentities(publicPermIdentity, await getPublicIdentity(permanentIdentity));
  });
});
