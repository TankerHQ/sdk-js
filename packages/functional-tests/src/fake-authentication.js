// @flow
import { utils } from '@tanker/crypto';
import FakeAuthentication from '@tanker/fake-authentication';
import { getPublicIdentity, _deserializePublicIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

import { fakeAuthUrl } from './Helpers';
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
    let appId;

    before(async () => {
      appId = utils.toBase64(args.appHelper.appId);
      fa = new FakeAuthentication({ appId, url: fakeAuthUrl });
    });

    it('handles invalid app id type', async () => {
      // $FlowIKnow the point of the test is to check the error when the type is wrong
      expect(() => new FakeAuthentication({ appId: 42, url: fakeAuthUrl })).to.throw();
      expect(() => new FakeAuthentication({ url: fakeAuthUrl })).to.throw();
    });

    it('handles invalid base64 app id', async () => {
      const badFa = new FakeAuthentication({ appId: 'bad-base-64', url: fakeAuthUrl });
      await expect(badFa.getIdentity()).to.be.rejected;
    });

    it('handles unknown app id', async () => {
      const badFa = new FakeAuthentication({ appId: 'deadbeef', url: fakeAuthUrl });
      await expect(badFa.getIdentity()).to.be.rejected;
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

    it('can be used to share resources across users', async () => {
      const aliceEmail = makeTestEmail();
      const bobEmail = makeTestEmail();

      const { identity: alicePrivateIdentity } = await fa.getIdentity(aliceEmail);
      const { identity: bobPrivateIdentity } = await fa.getIdentity(bobEmail);

      const [bobPublicIdentity] = await fa.getPublicIdentities([bobEmail]);

      const aliceTanker = args.makeTanker(appId);
      await aliceTanker.start(alicePrivateIdentity);
      await aliceTanker.registerIdentity({ passphrase: 'passphrase' });

      const bobTanker = args.makeTanker(appId);
      await bobTanker.start(bobPrivateIdentity);
      await bobTanker.registerIdentity({ passphrase: 'passphrase' });

      const message = await aliceTanker.encrypt('I love you', { shareWithUsers: [bobPublicIdentity] });
      await bobTanker.decrypt(message);
    });
  });
};

export default generateFakeAuthenticationTests;
