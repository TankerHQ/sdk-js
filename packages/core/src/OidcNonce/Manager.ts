import type { b64string } from '@tanker/crypto';
import { utils, tcrypto } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import { challengePrefix, challengeLengthByte } from './types';
import type { SignedChallenge } from './types';
import type { OidcStore } from './OidcStore';

export class OidcNonceManager {
  declare _oidcStore: OidcStore;
  declare _testNonce?: b64string;

  constructor(oidcStore: OidcStore) {
    this._oidcStore = oidcStore;
  }

  async createOidcNonce(): Promise<b64string> {
    const { privateKey, publicKey } = tcrypto.makeSignKeyPair();
    await this._oidcStore.saveOidcNonce(publicKey, privateKey);
    return utils.toBase64(publicKey);
  }

  setTestNonce(testNonce: b64string) {
    this._testNonce = testNonce;
  }

  getTestNonce(): b64string | undefined {
    return this._testNonce;
  }

  async signOidcChallenge(nonce: b64string, challenge: string): Promise<SignedChallenge> {
    if (challenge.indexOf(challengePrefix) !== 0) {
      throw new InternalError('illformed oidc challenge: invalid prefix');
    }

    const b64challenge = challenge.split(challengePrefix)[1]!;
    try {
      utils.assertB64StringWithSize(b64challenge, 'oidc challenge', challengeLengthByte);
    } catch (e) {
      throw new InternalError(`illformed oidc challenge: ${(e as Error).message}`);
    }

    const privateKey = await this._oidcStore.findOidcNonce(nonce);
    if (!privateKey) {
      throw new InvalidArgument(`could not find state for the given nonce: ${nonce}`);
    }

    const challengePayload = utils.fromBase64(b64challenge);
    return {
      challenge: b64challenge,
      signature: utils.toBase64(tcrypto.sign(challengePayload, privateKey)),
    };
  }

  async removeOidcNonce(nonce: b64string): Promise<void> {
    this._oidcStore.removeOidcNonce(nonce);
  }

  static extractNonce = (idToken: string): b64string => {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new InvalidArgument('ID token could not be decoded');
    }
    let payload: { nonce: string };
    try {
      payload = JSON.parse(utils.toString(utils.fromSafeBase64(parts[1]!)));
    } catch (e) {
      throw new InvalidArgument(`ID token could not be decoded: ${(e as Error).message}}`);
    }

    utils.assertB64StringWithSize(payload.nonce, 'oidcIdToken.nonce', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    return payload.nonce;
  };
}

export default OidcNonceManager;
