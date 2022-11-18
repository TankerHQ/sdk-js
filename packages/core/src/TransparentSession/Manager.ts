import { generichash, utils } from '@tanker/crypto';
import type { b64string } from '@tanker/crypto';
import type { EncryptionOptions } from '../DataProtection/options';
import { TaskCoalescer } from '../TaskCoalescer';
import type { TransparentSessionStore, SessionResult } from './SessionStore';

export type SessionGenerator = () => Promise<SessionResult>;

type LookupResult = {
  id: b64string;
  session: SessionResult;
};

export const computeRecipientHash = (recipients: EncryptionOptions): Uint8Array => {
  const recipientList = [
    ...(recipients.shareWithUsers || []).sort(),
    ' Users | Groups ',
    ...(recipients.shareWithGroups || []).sort(),
    recipients.shareWithSelf ? 'withSelf' : 'withoutSelf',
  ];
  return generichash(utils.fromString(recipientList.join('|')));
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

  async getTransparentSession(recipients: EncryptionOptions, sessionGenerator: SessionGenerator): Promise<SessionResult> {
    const recipientsHash = utils.toBase64(computeRecipientHash(recipients));

    const sessions = await this._keyLookupCoalescer.run(
      this._getTransparentSession(sessionGenerator),
      [recipientsHash],
    );

    return sessions[0]!.session;
  }
}

export default SessionManager;
