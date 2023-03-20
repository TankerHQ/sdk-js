import { generichash, number, utils } from '@tanker/crypto';
import type { b64string } from '@tanker/crypto';
import type { SharingOptions } from '../DataProtection/options';
import { TaskCoalescer } from '../TaskCoalescer';
import type { TransparentSessionStore, SessionResult } from './SessionStore';

export type SessionGenerator = () => Promise<SessionResult>;

type LookupResult = {
  id: b64string;
  session: SessionResult;
};

const formatIdArray = (ids: Array<string>) => ids.sort()
  .flatMap(id => [
    number.toUint32le(id.length),
    utils.fromString(id),
  ]);

export const computeRecipientHash = (recipients: Required<SharingOptions>): Uint8Array => {
  const users = new Set(recipients.shareWithUsers);
  const groups = new Set(recipients.shareWithGroups);

  const recipientsVector = utils.concatArrays(
    ...formatIdArray([...users.keys()]),
    utils.fromString('|'),
    ...formatIdArray([...groups.keys()]),
  );

  return generichash(recipientsVector);
};

export class SessionManager {
  _sessionStore: TransparentSessionStore;
  _keyLookupCoalescer: TaskCoalescer<LookupResult>;

  constructor(
    sessionStore: TransparentSessionStore,
  ) {
    this._sessionStore = sessionStore;
    this._keyLookupCoalescer = new TaskCoalescer();
  }

  _getTransparentSession = (sessionGenerator: SessionGenerator) => async (hashes: Array<b64string>) => Promise.all(
    hashes.map(async (b64Hash): Promise<LookupResult> => {
      const hash = utils.fromBase64(b64Hash);
      let session = await this._sessionStore.findSessionKey(hash);
      if (session !== null) {
        return { id: b64Hash, session };
      }

      session = await sessionGenerator();
      await this._sessionStore.saveSessionKey(hash, session.id, session.key);
      return { id: b64Hash, session };
    }),
  );

  // Precondition: if shareWithSelf was true, the user's public identity must be part of `recipients.shareWithUsers`
  async getTransparentSession(recipients: Required<SharingOptions>, sessionGenerator: SessionGenerator): Promise<SessionResult> {
    const recipientsHash = utils.toBase64(computeRecipientHash(recipients));

    const sessions = await this._keyLookupCoalescer.run(
      this._getTransparentSession(sessionGenerator),
      [recipientsHash],
    );

    return sessions[0]!.session;
  }
}
