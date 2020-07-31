// @flow

import { generichash, tcrypto, utils } from '@tanker/crypto';
import { InternalError, InvalidArgument, PreconditionFailed } from '@tanker/errors';
import type { SecretProvisionalIdentity, PublicProvisionalIdentity, PublicProvisionalUser } from '@tanker/identity';

import { VerificationNeeded } from '../errors.internal';

import { Client, b64RequestObject } from '../Network/Client';
import LocalUserManager, { type PrivateProvisionalKeys } from '../LocalUser/Manager';

import KeyStore from '../LocalUser/KeyStore';
import { formatVerificationRequest } from '../LocalUser/requests';
import type { EmailVerificationMethod, EmailVerification, OIDCVerification } from '../LocalUser/types';
import { statuses, type Status } from '../Session/status';
import UserManager from '../Users/Manager';

import { provisionalIdentityClaimFromBlock, makeProvisionalIdentityClaim } from './Serialize';
import { verifyProvisionalIdentityClaim } from './Verify';

type TankerProvisionalKeys = {|
  tankerSignatureKeyPair: tcrypto.SodiumKeyPair,
  tankerEncryptionKeyPair: tcrypto.SodiumKeyPair
|};

const tankerProvisionalKeys = (serverResult) => {
  if (!serverResult) {
    return null;
  }

  return {
    tankerSignatureKeyPair: {
      privateKey: utils.fromBase64(serverResult.signature_private_key),
      publicKey: utils.fromBase64(serverResult.signature_public_key),
    },
    tankerEncryptionKeyPair: {
      privateKey: utils.fromBase64(serverResult.encryption_private_key),
      publicKey: utils.fromBase64(serverResult.encryption_public_key),
    }
  };
};

export default class ProvisionalIdentityManager {
  _client: Client;
  _keyStore: KeyStore;
  _localUserManager: LocalUserManager;
  _userManager: UserManager;
  _provisionalIdentity: ?SecretProvisionalIdentity;
  _keyStore: KeyStore;

  constructor(
    client: Client,
    keyStore: KeyStore,
    localUserManager: LocalUserManager,
    userManager: UserManager,
  ) {
    this._client = client;
    this._localUserManager = localUserManager;
    this._userManager = userManager;
    this._keyStore = keyStore;
  }

  async attachProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity): Promise<{ status: Status, verificationMethod?: EmailVerificationMethod }> {
    let hasClaimed = this._localUserManager.hasProvisionalUserKey(utils.fromBase64(provisionalIdentity.public_encryption_key));

    if (!hasClaimed) {
      await this._refreshProvisionalPrivateKeys();
      hasClaimed = this._localUserManager.hasProvisionalUserKey(utils.fromBase64(provisionalIdentity.public_encryption_key));
    }

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

    // Target is already checked when deserializing the provisional identity
    throw new InternalError(`Assertion error: unsupported provisional identity target: ${provisionalIdentity.target}`);
  }

  async verifyProvisionalIdentity(verification: EmailVerification | OIDCVerification) {
    if (!('email' in verification) && !('oidcIdToken' in verification))
      throw new InternalError(`Assertion error: unsupported verification method for provisional identity: ${JSON.stringify(verification)}`);

    if (!this._provisionalIdentity)
      throw new PreconditionFailed('Cannot call verifyProvisionalIdentity() without having called attachProvisionalIdentity() before');

    const provisionalIdentity = this._provisionalIdentity;

    if (verification.email && provisionalIdentity.value !== verification.email)
      throw new InvalidArgument('"verification.email" does not match provisional identity');

    if (verification.oidcIdToken) {
      let jwtPayload;
      try {
        jwtPayload = JSON.parse(utils.toString(utils.fromBase64(verification.oidcIdToken.split('.')[1])));
      } catch (e) {
        throw new InvalidArgument('Failed to parse "verification.oidcIdToken"');
      }
      if (provisionalIdentity.value !== jwtPayload.email)
        throw new InvalidArgument('"verification.oidcIdToken" does not match provisional identity');
    }

    const tankerKeys = await this._verifyAndGetProvisionalIdentityKeys(verification);
    if (tankerKeys)
      await this._claimProvisionalIdentity(provisionalIdentity, tankerKeys);

    delete this._provisionalIdentity;
  }

  async getPrivateProvisionalKeys(appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): Promise<?PrivateProvisionalKeys> {
    const provisionalUserKeyPairs = this._localUserManager.findProvisionalUserKey(appPublicSignatureKey, tankerPublicSignatureKey);

    if (provisionalUserKeyPairs) {
      return provisionalUserKeyPairs;
    }
    await this._refreshProvisionalPrivateKeys();
    return this._localUserManager.findProvisionalUserKey(appPublicSignatureKey, tankerPublicSignatureKey);
  }

  async getProvisionalUsers(provisionalIdentities: Array<PublicProvisionalIdentity>): Promise<Array<PublicProvisionalUser>> {
    if (provisionalIdentities.length === 0)
      return [];

    const request = provisionalIdentities.map(provisionalIdentity => {
      if (provisionalIdentity.target !== 'email') {
        throw new InvalidArgument(`Unsupported provisional identity target: ${provisionalIdentity.target}`);
      }
      const email = generichash(utils.fromString(provisionalIdentity.value));
      return { type: 'email', hashed_email: email };
    });

    // Note: public keys are returned in an array matching the original order of provisional identities in the request
    const tankerPublicKeys = await this._client.send('get public provisional identities', b64RequestObject(request));

    return tankerPublicKeys.map((tpk, i) => ({
      trustchainId: utils.fromBase64(provisionalIdentities[i].trustchain_id),
      target: provisionalIdentities[i].target,
      value: provisionalIdentities[i].value,
      appEncryptionPublicKey: utils.fromBase64(provisionalIdentities[i].public_encryption_key),
      appSignaturePublicKey: utils.fromBase64(provisionalIdentities[i].public_signature_key),
      tankerEncryptionPublicKey: utils.fromBase64(tpk.encryption_public_key),
      tankerSignaturePublicKey: utils.fromBase64(tpk.signature_public_key),
    }));
  }

  async _getProvisionalIdentityKeys(email: string): Promise<?TankerProvisionalKeys> {
    let result;
    try {
      result = await this._client.send('get verified provisional identity', b64RequestObject({
        verification_method: {
          type: 'email',
          hashed_email: generichash(utils.fromString(email)),
        },
      }));
    } catch (e) {
      if (e instanceof VerificationNeeded) {
        return null;
      }
      throw e;
    }
    return tankerProvisionalKeys(result);
  }

  async _refreshProvisionalPrivateKeys() {
    const claimBlocks = await this._client.send('get my claim blocks');

    for (const claimBlock of claimBlocks) {
      const claimEntry = provisionalIdentityClaimFromBlock(claimBlock);
      const authorDeviceKeysMap = await this._userManager.getDeviceKeysByDevicesIds([claimEntry.author]);
      if (authorDeviceKeysMap.size !== 1) {
        throw new InternalError('refreshProvisionalPrivateKeys: zero or multiple keys for one device');
      }
      const authorDevicePublicSignatureKey = authorDeviceKeysMap.get(utils.toBase64(claimEntry.author));
      if (!authorDevicePublicSignatureKey) {
        throw new InternalError('refreshProvisionalPrivateKeys: author device should have a public signature key');
      }
      verifyProvisionalIdentityClaim(claimEntry, authorDevicePublicSignatureKey, this._localUserManager.localUser.userId);

      const privateProvisionalKeys = await this._decryptPrivateProvisionalKeys(claimEntry.recipient_user_public_key, claimEntry.encrypted_provisional_identity_private_keys);

      await this._localUserManager.addProvisionalUserKey(
        claimEntry.app_provisional_identity_signature_public_key,
        claimEntry.tanker_provisional_identity_signature_public_key,
        privateProvisionalKeys
      );
    }
  }

  async _decryptPrivateProvisionalKeys(recipientUserPublicKey: Uint8Array, encryptedPrivateProvisionalKeys: Uint8Array): Promise<PrivateProvisionalKeys> {
    const userKeyPair = await this._localUserManager.findUserKey(recipientUserPublicKey);

    const provisionalUserPrivateKeys = tcrypto.sealDecrypt(encryptedPrivateProvisionalKeys, userKeyPair);
    const appEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(0, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    const tankerEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    return { appEncryptionKeyPair, tankerEncryptionKeyPair };
  }

  async _verifyAndGetProvisionalIdentityKeys(verification: EmailVerification | OIDCVerification): Promise<?TankerProvisionalKeys> {
    const result = await this._client.send('get provisional identity', b64RequestObject({
      verification: formatVerificationRequest(verification, this._localUserManager.localUser),
    }));
    return tankerProvisionalKeys(result);
  }

  async _claimProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity, tankerKeys: TankerProvisionalKeys): Promise<void> {
    await this._localUserManager.updateLocalUser();

    const appProvisionalUserPrivateSignatureKey = utils.fromBase64(provisionalIdentity.private_signature_key);
    const appProvisionalUserPrivateEncryptionKey = utils.fromBase64(provisionalIdentity.private_encryption_key);

    const provisionalUserKeys = {
      ...tankerKeys,
      appEncryptionKeyPair: tcrypto.getEncryptionKeyPairFromPrivateKey(appProvisionalUserPrivateEncryptionKey),
      appSignatureKeyPair: tcrypto.getSignatureKeyPairFromPrivateKey(appProvisionalUserPrivateSignatureKey),
    };

    const { userId, deviceId, currentUserKey } = this._localUserManager.localUser;
    const { payload, nature } = makeProvisionalIdentityClaim(userId, deviceId, currentUserKey.publicKey, provisionalUserKeys);

    await this._client.send('push block', this._localUserManager.localUser.makeBlock(payload, nature), true);
  }
}
