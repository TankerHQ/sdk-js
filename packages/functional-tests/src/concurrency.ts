import { statuses } from '@tanker/core';
import type { b64string, Tanker } from '@tanker/core';
import { getPublicIdentity } from '@tanker/identity';
import { expect, uuid } from '@tanker/test-utils';

import { expectDecrypt } from './helpers';
import type { TestArgs, AppHelper } from './helpers';
import type { AppProvisionalUser } from './helpers/AppHelper';

const retry = async <T>(operation: () => Promise<T>, nbTries: number, ...expectedErrors: string[]): Promise<T> => {
  for (let index = 0; index < nbTries; index++) {
    try {
      return await operation();
    } catch (e) {
      if (expectedErrors.length > 0) {
        expect((e as Error).toString()).to.contain.oneOf(expectedErrors);
      }
    }
  }
  throw new Error(`operation did not succeed within ${nbTries} tries`);
};

export const generateConcurrencyTests = (args: TestArgs) => {
  const makeTanker = (b64AppId?: b64string) => {
    const tanker = args.makeTanker(b64AppId);
    // eslint-disable-next-line no-underscore-dangle
    tanker._clientOptions.sdkInfo.type = `${tanker._clientOptions.sdkInfo.type}-concurrency`;

    return tanker;
  };

  describe('concurrent Identity usage on unique device', () => {
    const tabCount = 3;
    let appHelper: AppHelper;
    let bobIdentity: b64string;
    let bobPublicIdentity: b64string;
    let aliceIdentity: b64string;
    let aliceLaptop: Tanker;
    let alicePublicIdentity: b64string;
    let firstTab: Tanker;
    let otherTabs: Array<Tanker> = [];
    let bobSessions: Array<Tanker> = [];

    before(async () => {
      ({ appHelper } = args);
      aliceIdentity = await appHelper.generateIdentity(uuid.v4());
      alicePublicIdentity = await getPublicIdentity(aliceIdentity);
      aliceLaptop = makeTanker();
      await aliceLaptop.start(aliceIdentity);
      aliceLaptop.registerIdentity({ passphrase: 'password' });
    });

    beforeEach(async () => {
      const bobId = uuid.v4();
      bobIdentity = await appHelper.generateIdentity(bobId);
      bobPublicIdentity = await getPublicIdentity(bobIdentity);
      firstTab = makeTanker();
      for (let index = 1; index < tabCount; index++) {
        otherTabs.push(makeTanker());
      }

      bobSessions.push(firstTab, ...otherTabs);
    });

    afterEach(async () => {
      await Promise.all(bobSessions.map((session) => session.stop()));
      bobSessions = [];
      otherTabs = [];
    });

    after(async () => {
      await aliceLaptop.stop();
    });

    it('starts without error [0FPGL1]', async () => {
      await expect(Promise.all([
        firstTab.start(bobIdentity),
        ...otherTabs.map((tanker) => tanker.start(bobIdentity)),
      ]), 'failed to start both sessions').be.fulfilled;
    });

    it('registers only one of the sessions, others should restart [73BPC3]', async () => {
      await firstTab.start(bobIdentity);
      await Promise.all(otherTabs.map((tanker) => tanker.start(bobIdentity)));
      let nbRegisteredSessions = 0;

      // every sessions will try to register but only one will succeed
      await expect(Promise.all(
        bobSessions.map(async (session) => {
          try {
            await session.registerIdentity({ passphrase: 'password' });
            nbRegisteredSessions += 1;
          } catch (error) {
            expect((error as Error).message).to.contain('this ID already exists');
            expect(session.status).to.equal(statuses.STOPPED);
            // the dead session should restart.
            await expect(session.start(bobIdentity)).to.be.fulfilled;
          }
        }),
      ), 'failed to register or restart sessions').be.fulfilled;

      expect(nbRegisteredSessions, 'Only one session should be registered').to.equal(1);
    });

    describe('once Tanker are started', () => {
      beforeEach(async () => {
        await firstTab.start(bobIdentity);
        await firstTab.registerIdentity({ passphrase: 'password' });

        for (const tanker of otherTabs) {
          await tanker.start(bobIdentity);
          await tanker.verifyIdentity({ passphrase: 'password' });
        }
      });

      it('decrypt concurrently [MX7QG2]', async () => {
        const clearData = 'a beautiful word';
        const encryptedData = await aliceLaptop.encrypt(clearData, { shareWithUsers: [bobPublicIdentity] });

        const decryptedDataArray = await expect(Promise.all(
          bobSessions.map((session) => session.decrypt(encryptedData)),
        ), 'failed to decrypt from both sessions').to.be.fulfilled;

        for (const decryptedData of decryptedDataArray) {
          expect(decryptedData).to.equal(clearData);
        }
      });

      it('decrypt resource shared through group concurrently [RO6DP7]', async () => {
        const clearData = 'a beautiful word';
        const groupId = await aliceLaptop.createGroup([bobPublicIdentity]);
        const encryptedData = await aliceLaptop.encrypt(clearData, { shareWithGroups: [groupId] });

        const decryptedDataArray = await expect(Promise.all(
          bobSessions.map((session) => session.decrypt(encryptedData)),
        ), 'failed to decrypt from both sessions').to.be.fulfilled;

        for (const decryptedData of decryptedDataArray) {
          expect(decryptedData).to.equal(clearData);
        }
      });

      it('encrypt concurrently [SMS58X]', async () => {
        const clearData = 'an unexpected response';
        const encryptedDataArray = await expect(Promise.all(
          bobSessions.map((session) => session.encrypt(clearData, { shareWithUsers: [alicePublicIdentity] })),
        ), 'failed to encrypt from both sessions').to.be.fulfilled as Array<Uint8Array>;

        await Promise.all(
          encryptedDataArray.map((encryptedData) => expectDecrypt([aliceLaptop], clearData, encryptedData)),
        );
      });

      it('share concurrently [HNWFV3]', async () => {
        const clearData = 'an unexpected response';
        const encryptedData = await bobSessions[0]!.encrypt(clearData);
        const resourceId = await bobSessions[0]!.getResourceId(encryptedData);

        await expect(Promise.all(
          bobSessions.map((session) => session.share([resourceId], { shareWithUsers: [alicePublicIdentity] })),
        ), 'failed to share from both sessions').to.be.fulfilled;

        await expectDecrypt([aliceLaptop], clearData, encryptedData);
      });

      describe('handling group', () => {
        let clearData: string;
        let encryptedData: Uint8Array;
        let resourceId: b64string;

        beforeEach(async () => {
          clearData = 'whining to the group';
          encryptedData = await bobSessions[0]!.encrypt(clearData);
          resourceId = await bobSessions[0]!.getResourceId(encryptedData);
        });

        it('create group concurrently [WX3H50]', async () => {
          const groups = await expect(Promise.all(
            bobSessions.map(session => session.createGroup([alicePublicIdentity])),
          ), 'failed to createGroup from both sessions').to.be.fulfilled as Array<b64string>;

          await Promise.all(
            groups.map((groupId, index) => bobSessions[index]!.share([resourceId], { shareWithGroups: [groupId] })),
          );

          await expectDecrypt([aliceLaptop], clearData, encryptedData);
        });

        it('add member to a group concurrently [BXA5BC]', async () => {
          const groupId = await bobSessions[0]!.createGroup([bobPublicIdentity]);
          await bobSessions[0]!.share([resourceId], { shareWithGroups: [groupId] });

          await expect(Promise.all(
            bobSessions.map(session => retry(
              () => session.updateGroupMembers(groupId, { usersToAdd: [alicePublicIdentity] }),
              bobSessions.length,
              'There was a conflict with a concurrent operation',
            )),
          ), 'failed to updateGroupMember from both sessions').to.be.fulfilled;

          await expectDecrypt([aliceLaptop], clearData, encryptedData);
        });
      });

      describe('handling provisional identities [TK7LDV]', () => {
        let provisionalIdentity: AppProvisionalUser;
        let clearData: string;
        let encryptedData: Uint8Array;

        beforeEach(async () => {
          provisionalIdentity = await appHelper.generateEmailProvisionalIdentity();

          clearData = 'throwing a bottle in the sea';
          encryptedData = await aliceLaptop.encrypt(clearData, { shareWithUsers: [provisionalIdentity.publicIdentity] });
        });

        it('attach using verification code [ETH2UR]', async () => {
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

        it('attach using verification code using the fast path [DT6P6N]', async () => {
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
