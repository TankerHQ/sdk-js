import { expect } from '@tanker/test-utils';
import { errors } from '@tanker/core';

import type { UserSession } from './session';
import type { EncryptedBuffer } from './encrypt';
import { checkDecrypt, checkDecryptFails } from './encrypt';

const checkUpdateGroup = async (sessions: Array<UserSession>, groupId: string) => {
  for (const [i, session] of sessions.entries())
    await expect(session.session.updateGroupMembers(
      groupId, { usersToAdd: [session.userSPublicIdentity] },
    ), `user ${i} should be able to update group`).to.be.fulfilled;
};

const checkUpdateGroupFails = async (sessions: Array<UserSession>, groupId: string) => {
  for (const [i, session] of sessions.entries())
    await expect(session.session.updateGroupMembers(
      groupId, { usersToAdd: [session.userSPublicIdentity] },
    ))
      .to.be.rejectedWith(errors.InvalidArgument, 'not a member of this group', `user ${i} should not be able to update group`);
};

export const checkGroup = async (groupId: string,
  buffers: Array<EncryptedBuffer>,
  usersInGroup: Array<UserSession>,
  usersNotInGroup: Array<UserSession>) => {
  await checkDecrypt(usersInGroup, buffers);
  await checkUpdateGroup(usersInGroup, groupId);
  await checkDecryptFails(usersNotInGroup, buffers);
  await checkUpdateGroupFails(usersNotInGroup, groupId);
};
