// @flow

import { tcrypto, utils } from '@tanker/crypto';
import { type SecretProvisionalIdentity, InvalidIdentity } from '@tanker/identity';

import { InvalidVerificationCode, InvalidProvisionalIdentityStatus, MaxVerificationAttemptsReached } from '../errors';

import { Client } from '../Network/Client';
import LocalUser from '../Session/LocalUser';
import Trustchain from '../Trustchain/Trustchain';
import Storage from '../Session/Storage';
import { statuses, type EmailVerificationMethod, type Status, type EmailVerification } from '../Session/types';
import UserAccessor from '../Users/UserAccessor';

export type KeyResourceId = {
  key: Uint8Array,
  resourceId: Uint8Array,
};

type TankerProvisionalKeys = {
  tankerSignatureKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair
};

const tankerProvisionalKeys = (serverResult) => {
  if (!serverResult) {
    return null;
  }

  return {
    tankerSignatureKeyPair: {
      privateKey: utils.fromBase64(serverResult.SignaturePrivateKey),
      publicKey: utils.fromBase64(serverResult.SignaturePublicKey),
    },
    tankerEncryptionKeyPair: {
      privateKey: utils.fromBase64(serverResult.EncryptionPrivateKey),
      publicKey: utils.fromBase64(serverResult.EncryptionPublicKey),
    }
  };
};

export default class DeviceManager {
  _trustchain: Trustchain;
  _client: Client;
  _localUser: LocalUser;
  _storage: Storage;
  _userAccessor: UserAccessor;
  _provisionalIdentity: SecretProvisionalIdentity;

  constructor(
    trustchain: Trustchain,
    client: Client,
    localUser: LocalUser,
    storage: Storage,
    userAccessor: UserAccessor,
  ) {
    this._trustchain = trustchain;
    this._client = client;
    this._storage = storage;
    this._localUser = localUser;
    this._userAccessor = userAccessor;
  }

  async revokeDevice(revokedDeviceId: string): Promise<void> {
    // sync the trustchain to be sure we have all our devices, in case we just
    // added one, or generated an unlock key
    await this._trustchain.sync();
    const user = await this._userAccessor.findUser({ userId: this._localUser.userId });
    if (!user)
      throw new Error('Cannot find the current user in the users');

    const revokeDeviceBlock = this._localUser.blockGenerator.makeDeviceRevocationBlock(user, this._storage.keyStore.currentUserKey, revokedDeviceId);
    await this._client.sendBlock(revokeDeviceBlock);
    await this._trustchain.sync();
  }

  async attachProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity): Promise<{ status: Status, verificationMethod?: EmailVerificationMethod }> {
    const hasClaimed = this._localUser.hasClaimedProvisionalIdentity(provisionalIdentity);

    if (hasClaimed) {
      return { status: statuses.READY };
    }

    if (provisionalIdentity.target === 'email') {
      const email = provisionalIdentity.value;

      const tankerKeys = await this._getProvisionalIdentityKeys(email);
      if (tankerKeys) {
        await this._claimProvisionalIdentity(provisionalIdentity, tankerKeys);
        return { status: statuses.READY };
      }
      this._provisionalIdentity = provisionalIdentity;

      return {
        status: statuses.IDENTITY_VERIFICATION_NEEDED,
        verificationMethod: { type: 'email', email },
      };
    }
    throw new InvalidIdentity(`Unsupported provisional identity target: ${provisionalIdentity.target}`);
  }

  async verifyProvisionalIdentity(verification: EmailVerification) {
    if (!('email' in verification))
      throw new Error(`Assertion error: unsupported verification method for provisional identity: ${JSON.stringify(verification)}`);

    if (!this._provisionalIdentity)
      throw new InvalidProvisionalIdentityStatus('Cannot call verifyProvisionalIdentity() without having called attachProvisionalIdentity() before');

    if (this._provisionalIdentity.value !== verification.email)
      throw new InvalidProvisionalIdentityStatus('Verification email does not match provisional identity');

    const tankerKeys = await this._verifyAndGetProvisionalIdentityKeys(this._provisionalIdentity, verification);
    if (tankerKeys)
      await this._claimProvisionalIdentity(this._provisionalIdentity, tankerKeys);

    delete this._provisionalIdentity;
  }

  async _getProvisionalIdentityKeys(email: string): Promise<?TankerProvisionalKeys> {
    let res;
    try {
      res = await this._client.send('get provisional identity', { email });
    } catch (e) {
      const error = e.error;
      if (error.code && error.code === 'verification_needed') {
        return null;
      }
      throw e;
    }
    return tankerProvisionalKeys(res);
  }

  async _verifyAndGetProvisionalIdentityKeys(provisionalIdentity: SecretProvisionalIdentity, verification: EmailVerification): Promise<?TankerProvisionalKeys> {
    let res;
    try {
      res = await this._client.send('get provisional identity', { email: provisionalIdentity.value, verification_code: verification.verificationCode });
    } catch (e) {
      const error = e.error;
      if (error.code) {
        if (error.code === 'invalid_verification_code') {
          throw new InvalidVerificationCode(error);
        } else if (error.code === 'max_attempts_reached') {
          throw new MaxVerificationAttemptsReached(e);
        }
      }
      throw e;
    }
    return tankerProvisionalKeys(res);
  }

  async _claimProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity, tankerKeys: TankerProvisionalKeys): Promise<void> {
    const appProvisionalUserPrivateSignatureKey = utils.fromBase64(provisionalIdentity.private_signature_key);
    const appProvisionalUserPrivateEncryptionKey = utils.fromBase64(provisionalIdentity.private_encryption_key);

    const provisionalUserKeys = {
      ...tankerKeys,
      appEncryptionKeyPair: tcrypto.getEncryptionKeyPairFromPrivateKey(appProvisionalUserPrivateEncryptionKey),
      appSignatureKeyPair: tcrypto.getSignatureKeyPairFromPrivateKey(appProvisionalUserPrivateSignatureKey),
    };
    const userPubKey = this._localUser.currentUserKey.publicKey;
    const block = this._localUser.blockGenerator.makeProvisionalIdentityClaimBlock(this._localUser.userId, userPubKey, provisionalUserKeys);

    await this._client.sendBlock(block);
    await this._trustchain.sync();
  }
}
