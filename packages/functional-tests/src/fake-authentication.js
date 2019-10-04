// @flow
import { utils } from '@tanker/crypto';
import FakeAuthentication from '@tanker/fake-authentication';
import { getPublicIdentity, _deserializePublicIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

import { tankerUrl } from './Helpers';
import type { TestArgs } from './TestArgs';

const generateFakeAuthenticationTests = (args: TestArgs) => {
  const makeTestEmail = () => `${uuid.v4()}@example.com`;

  const expectMatchingPublicIdentities = (identityA: string, identityB: string) => expect(
    _deserializePublicIdentity(identityA),
  ).to.deep.equal(
    _deserializePublicIdentity(identityB),
  );

  describe('fake authentication', () => {
    let fa;

    before(async () => {
      const appId = utils.toBase64(args.appHelper.appId);
      const url = tankerUrl.replace('api.', 'fakeauth.');
      fa = new FakeAuthentication({ appId, url });
    });

    it('returns a disposable permanent identity without an email', async () => {
      const privateIdentity = await fa.getIdentity();
      const { identity, provisionalIdentity } = privateIdentity;
      expect(identity).to.be.a.string;
      expect(provisionalIdentity).not.to.exist;
    });

    it('returns a permanent identity for the given email', async () => {
      const email = makeTestEmail();
      const privateIdentity = await fa.getIdentity(email);
      const { identity, provisionalIdentity } = privateIdentity;
      expect(identity).to.be.a.string;
      expect(provisionalIdentity).not.to.exist;
    });

    it('returns the same permanent identity when requested multiple times', async () => {
      const email = makeTestEmail();

      const result1 = await fa.getIdentity(email);
      const result2 = await fa.getIdentity(email);

      expect(result1).to.deep.equal(result2);
    });

    it('returns a list of public identities (provisional and permanent)', async () => {
      const email1 = makeTestEmail();
      const email2 = makeTestEmail();

      // email1 exists, while email2 is provisional
      const priv1 = await fa.getIdentity(email1);
      const [pub1, pub2] = await fa.getPublicIdentities([email1, email2]);
      const priv2 = await fa.getIdentity(email2);

      expectMatchingPublicIdentities(pub1, await getPublicIdentity(priv1.identity));
      expectMatchingPublicIdentities(pub2, await getPublicIdentity(priv2.provisionalIdentity));
    });

    it('returns the proper public identity before and after the private identity has been used', async () => {
      const email = makeTestEmail();

      const [publicProvIdentity1] = await fa.getPublicIdentities([email]);
      const { identity, provisionalIdentity } = await fa.getIdentity(email);
      const [publicProvIdentity2] = await fa.getPublicIdentities([email]);
      await fa.setIdentityRegistered(email);
      const [publicPermIdentity] = await fa.getPublicIdentities([email]);

      expectMatchingPublicIdentities(publicProvIdentity1, await getPublicIdentity(provisionalIdentity));
      expectMatchingPublicIdentities(publicProvIdentity2, await getPublicIdentity(provisionalIdentity));
      expectMatchingPublicIdentities(publicPermIdentity, await getPublicIdentity(identity));
    });
  });
};

export default generateFakeAuthenticationTests;
