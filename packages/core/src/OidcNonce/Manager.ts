import type { b64string } from '@tanker/crypto';
import { utils, tcrypto } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import type { OidcStore } from './OidcStore';

const challengePrefix = 'oidc-verification-prefix';
const challengeLengthByte = 24;

export class OidcNonceManager {
  declare _oidcStore: OidcStore;

  constructor(oidcStore: OidcStore) {
    this._oidcStore = oidcStore;
  }

  async createOidcNonce(): Promise<b64string> {
    const { privateKey, publicKey } = tcrypto.makeSignKeyPair();
    await this._oidcStore.saveOidcNonce(publicKey, privateKey);
    return utils.toBase64(publicKey);
  }

  async signOidcChallenge(nonce: b64string, challenge: string): Promise<b64string> {
    if (challenge.indexOf(challengePrefix) !== 0) {
      throw new InternalError('illformed oidc challenge: invalid prefix');
    }

    const challengeStr = challenge.split(challengePrefix)[1]!;
    try {
      utils.assertB64StringWithSize(challengeStr, 'oidc challenge', challengeLengthByte);
    } catch (e) {
      throw new InternalError(`illformed oidc challenge: ${(e as Error).message}`);
    }

    const privateKey = await this._oidcStore.findOidcNonce(nonce);
    if (!privateKey) {
      throw new InvalidArgument(`could not find state for the given nonce: ${nonce}`);
    }

    const challengePayload = utils.fromBase64(challengeStr);
    return utils.toBase64(utils.concatArrays(challengePayload, tcrypto.sign(challengePayload, privateKey)));
  }

  async removeOidcNonce(nonce: b64string): Promise<void> {
    this._oidcStore.removeOidcNonce(nonce);
  }

  static extractNonce = (idToken: string): b64string => {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new InvalidArgument('ID token could not be decoded');
    }
    const payload = JSON.parse(utils.toString(utils.fromSafeBase64(parts[1]!)));

    utils.assertB64StringWithSize(payload.nonce, 'oidcIdToken.nonce', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    return payload.nonce;
  };
}

export default OidcNonceManager;
