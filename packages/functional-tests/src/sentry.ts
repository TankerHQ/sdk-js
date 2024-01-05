import { Tanker, type b64string } from '@tanker/core';
import { expect } from '@tanker/test-utils';
import { errors } from '@tanker/core';
import { utils } from '@tanker/crypto';

import type { TestArgs, AppHelper } from './helpers';
import type { Breadcrumb, BreadcrumbHint, Primitive } from '@sentry/types';
import { getPublicIdentity } from '@tanker/identity';

class MockSentryHub {
  breadcrumbs: Array<Breadcrumb>;
  tags: { [key: string]: Primitive };

  constructor() {
    this.breadcrumbs = [];
    this.tags = {};
  }

  addBreadcrumb = (breadcrumb: Breadcrumb, _?: BreadcrumbHint) => {
    this.breadcrumbs.push(breadcrumb);
  };

  setTag = (key: string, value: Primitive) => {
    this.tags[key] = value;
  };
}

export const generateSentryTests = (args: TestArgs) => {
  const fakeMissingResource = utils.fromBase64('CrrQdawRM9/icauwqmrgFiHal4v3uMQnqptJcz4nOCV1Lag+RKvttOr6XAzfQSQai9PGtoi5hLcELy+e');

  describe('Sentry integration', () => {
    let hub: MockSentryHub;
    let alice: Tanker;
    let aliceIdentity: b64string;
    let appHelper: AppHelper;

    before(async () => {
      ({ appHelper } = args);
    });

    beforeEach(async () => {
      hub = new MockSentryHub();
      // @ts-expect-error Mock doesn't implement the full interface
      alice = args.makeTanker(undefined, { sentryHub: hub });
      aliceIdentity = await appHelper.generateIdentity();
      await alice.start(aliceIdentity);
      await alice.registerIdentity({ passphrase: 'passphrase' });
    });

    afterEach(async () => {
      await alice.stop();
    });

    it("doesn't set tags when everything goes well", async () => {
      const encrypted = await alice.encrypt('foo');
      await alice.decrypt(encrypted);
      expect(hub.tags).to.deep.equal({});
    });

    it('sets tags when decryption fails', async () => {
      await expect(alice.decrypt(fakeMissingResource)).to.be.rejectedWith(errors.InvalidArgument);

      const aliceUserId = utils.fromB64Json(aliceIdentity)['value'];

      expect(hub.tags['tanker_app_id']).to.equal(utils.toBase64(appHelper.appId));
      expect(hub.tags['tanker_user_id']).to.equal(aliceUserId);
      expect(hub.tags['tanker_status']).to.equal('READY');
    });

    it('logs a breadcrumb when decryption fails', async () => {
      await expect(alice.decrypt(fakeMissingResource)).to.be.rejectedWith(errors.InvalidArgument);

      expect(hub.breadcrumbs).to.have.lengthOf(2);
      expect(hub.breadcrumbs[0]?.message).to.contain('Key not found'); // Transparent session key
      expect(hub.breadcrumbs[1]?.message).to.contain('Key not found'); // Individual resource key
    });

    it('keeps breadcrumbs of previous operations', async () => {
      const encryptedGood = await alice.encrypt('good');
      await alice.decrypt(encryptedGood);

      await expect(alice.decrypt(fakeMissingResource)).to.be.rejectedWith(errors.InvalidArgument);

      expect(hub.breadcrumbs).to.have.lengthOf(1 + 2);
      expect(hub.breadcrumbs[0]?.message).to.contain('Tanker key found in cache'); // 1st decrypt key found
      expect(hub.breadcrumbs[1]?.message).to.contain('Key not found'); // 2nd transparent session key
      expect(hub.breadcrumbs[2]?.message).to.contain('Key not found'); // 2nd individual resource key
    });

    it('logs a breadcrumb when decrypting with a key fetched from the server', async () => {
      const bob = args.makeTanker();
      await bob.start(await appHelper.generateIdentity());
      await bob.registerIdentity({ passphrase: 'passphrase' });
      const options = {
        shareWithUsers: [await getPublicIdentity(aliceIdentity)],
      };
      const encrypted = await bob.encrypt('foo', options);

      await alice.decrypt(encrypted);
      await expect(alice.decrypt(fakeMissingResource)).to.be.rejectedWith(errors.InvalidArgument);

      expect(hub.breadcrumbs).to.have.lengthOf(1 + 2);
      expect(hub.breadcrumbs[0]?.message).to.contain('Tanker key not found in cache, but fetched from server');
      expect(hub.breadcrumbs[1]?.message).to.contain('Key not found'); // 2nd transparent session key
      expect(hub.breadcrumbs[2]?.message).to.contain('Key not found'); // 2nd individual resource key
    });
  });
};
