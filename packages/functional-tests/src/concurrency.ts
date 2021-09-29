import { statuses } from '@tanker/core';
import type { b64string, Tanker } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

import { expectDecrypt } from './helpers';
import type { TestArgs, AppHelper } from './helpers';
import type { AppProvisionalUser } from './helpers/AppHelper';

const retry = (f: (...args: any[]) => Promise<any>, ...args: any[]) => f(...args).catch(() => f(...args));

export const generateConcurrencyTests = (args: TestArgs) => {
  describe('concurrent Identity usage on unique device', () => {
    let appHelper: AppHelper;
    let bobIdentity: b64string;
    let bobPublicIdentity: b64string;
    let aliceIdentity: b64string;
    let aliceLaptop: Tanker;
    let alicePublicIdentity: b64string;
    let bobSessions: Array<Tanker> = [];
    let firstTab: Tanker;
    let secondTab: Tanker;

    before(async () => {
      ({ appHelper } = args);
      aliceIdentity = await appHelper.generateIdentity(uuid.v4());
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      aliceLaptop = args.makeTanker();
      await aliceLaptop.start(aliceIdentity);
      aliceLaptop.registerIdentity({ passphrase: 'password' });
    });

    beforeEach(async () => {
      const bobId = uuid.v4();
      bobIdentity = await appHelper.generateIdentity(bobId);
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      firstTab = args.makeTanker();
      secondTab = args.makeTanker();
      bobSessions.push(firstTab, secondTab);
    });

    afterEach(async () => {
      await Promise.all(bobSessions.map((session) => session.stop()));
      bobSessions = [];
    });

    after(async () => {
      await aliceLaptop.stop();
    });

    it('starts without error', async () => {
      await expect(Promise.all([
        firstTab.start(bobIdentity),
        secondTab.start(bobIdentity),
      ]), 'failed to start both sessions').be.fulfilled;
    });

    it('registers only one of the sessions, others should restart', async () => {
      await firstTab.start(bobIdentity);
      await secondTab.start(bobIdentity);

      // every sessions will try to register but only one will succeed
      await expect(Promise.all(
        bobSessions.map((session) => session.registerIdentity({ passphrase: 'password' })
          .catch(async (error) => {
            expect(error.message).to.contain('user_already_exists');
            expect(session.status).to.equal(statuses.STOPPED);
            // the dead session should restart.
            await expect(session.start(bobIdentity)).to.be.fulfilled;
          })),
      ), 'failed to register or restart sessions').be.fulfilled;
    });

    it('reaches READY after verifying the restarted sessions', async () => {
      await firstTab.start(bobIdentity);
      await secondTab.start(bobIdentity);

      await firstTab.registerIdentity({ passphrase: 'password' });
      await expect(secondTab.registerIdentity({ passphrase: 'password' })).to.be.rejectedWith('user_already_exists');
      await secondTab.start(bobIdentity);

      await expect(Promise.all(
        bobSessions.map(async (session) => {
          if (session.status === statuses.READY)
            return '';
          return session.verifyIdentity({ passphrase: 'password' });
        }),
      ), 'failed to verify restarted sessions').to.be.fulfilled;

      for (const session of bobSessions) {
        expect(session.status).to.equal(statuses.READY);
      }
    });

    describe('once Tanker are started', () => {
      beforeEach(async () => {
        await firstTab.start(bobIdentity);
        await firstTab.registerIdentity({ passphrase: 'password' });
        await secondTab.start(bobIdentity);
        await secondTab.verifyIdentity({ passphrase: 'password' });
      });

      it('decrypt concurrently', async () => {
        const clearData = 'a beautiful word';
        const encryptedData = await aliceLaptop.encrypt(clearData, { shareWithUsers: [bobPublicIdentity] });

        const decryptedDataArray = await expect(Promise.all(
          bobSessions.map((session) => session.decrypt(encryptedData)),
        ), 'failed to decrypt from both sessions').to.be.fulfilled;

        for (const decryptedData of decryptedDataArray) {
          expect(decryptedData).to.equal(clearData);
        }
      });

      it('decrypt resource shared through group concurrently', async () => {
        const clearData = 'a beautiful word';
        const groupID = await aliceLaptop.createGroup([bobPublicIdentity]);
        const encryptedData = await aliceLaptop.encrypt(clearData, { shareWithGroups: [groupID] });

        const decryptedDataArray = await expect(Promise.all(
          bobSessions.map((session) => session.decrypt(encryptedData)),
        ), 'failed to decrypt from both sessions').to.be.fulfilled;

        for (const decryptedData of decryptedDataArray) {
          expect(decryptedData).to.equal(clearData);
        }
      });

      it('encrypt concurrently', async () => {
        const clearData = 'an unexpected response';
        const encryptedDataArray = await expect(Promise.all(
          bobSessions.map((session) => session.encrypt(clearData, { shareWithUsers: [alicePublicIdentity] })),
        ), 'failed to encrypt from both sessions').to.be.fulfilled as Array<Uint8Array>;

        await Promise.all(
          encryptedDataArray.map((encryptedData) => expectDecrypt([aliceLaptop], clearData, encryptedData)),
        );
      });

      it('share concurrently', async () => {
        const clearData = 'an unexpected response';
        const encryptedData = await bobSessions[0]!.encrypt(clearData);
        const resourceID = await bobSessions[0]!.getResourceId(encryptedData);

        await expect(Promise.all(
          bobSessions.map((session) => session.share([resourceID], { shareWithUsers: [alicePublicIdentity] })),
        ), 'failed to share from both sessions').to.be.fulfilled;

        await expectDecrypt([aliceLaptop], clearData, encryptedData);
      });

      describe('handling group', () => {
        let clearData: string;
        let encryptedData: Uint8Array;
        let resourceID: b64string;

        beforeEach(async () => {
          clearData = 'whining to the group';
          encryptedData = await bobSessions[0]!.encrypt(clearData);
          resourceID = await bobSessions[0]!.getResourceId(encryptedData);
        });

        it('create group concurrently', async () => {
          const groups = await expect(Promise.all(
            bobSessions.map(session => session.createGroup([alicePublicIdentity])),
          ), 'failed to createGroup from both sessions').to.be.fulfilled as Array<b64string>;

          await Promise.all(
            groups.map((groupID, index) => bobSessions[index]!.share([resourceID], { shareWithGroups: [groupID] })),
          );

          await expectDecrypt([aliceLaptop], clearData, encryptedData);
        });

        it('add member to a group concurrently', async () => {
          const groupID = await bobSessions[0]!.createGroup([bobPublicIdentity]);
          await bobSessions[0]!.share([resourceID], { shareWithGroups: [groupID] });

          await expect(Promise.all(
            bobSessions.map(session => retry(
              (tanker: Tanker) => tanker.updateGroupMembers(groupID, { usersToAdd: [alicePublicIdentity] }),
              session,
            )),
          ), 'failed to updateGroupMember from both sessions').to.be.fulfilled;

          await expectDecrypt([aliceLaptop], clearData, encryptedData);
        });
      });

      describe('handling provisional identities', () => {
        let provisionalIdentity: AppProvisionalUser;
        let clearData: string;
        let encryptedData: Uint8Array;

        beforeEach(async () => {
          provisionalIdentity = await appHelper.generateEmailProvisionalIdentity();

          clearData = 'throwing a bottle in the sea';
          encryptedData = await aliceLaptop.encrypt(clearData, { shareWithUsers: [provisionalIdentity.publicIdentity] });
        });

        it('attach using verification code', async () => {
          await Promise.all(
            bobSessions.map(session => appHelper.attachVerifyEmailProvisionalIdentity(session, provisionalIdentity)
              .catch((error) => expect(error.message).to.contain.oneOf([
                'invalid_verification_code',
                'verification_code_not_found',
                'provisional_identity_already_attached',
              ]))),
          );

          // ensure the second tab can attach after a retry
          await expect(Promise.all(
            bobSessions.map(session => session.attachProvisionalIdentity(provisionalIdentity.identity)),
          )).to.be.fulfilled;

          await expectDecrypt(bobSessions, clearData, encryptedData);
        });

        it('attach using verification code using the fast path', async () => {
          const verificationCode = await appHelper.getEmailVerificationCode(provisionalIdentity.value);
          await bobSessions[0]!.setVerificationMethod({ email: provisionalIdentity.value, verificationCode });

          await Promise.all(
            bobSessions.map(session => session.attachProvisionalIdentity(provisionalIdentity.identity)
              .catch(error => expect(error.message).to.contain(
                'provisional_identity_already_attached',
              ))),
          );
        });
      });
    });
  });
};
