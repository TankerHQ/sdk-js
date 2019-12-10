// @flow

import { generichash, tcrypto, utils } from '@tanker/crypto';
import { InternalError, InvalidArgument, PreconditionFailed, DeviceRevoked } from '@tanker/errors';
import { type SecretProvisionalIdentity, type PublicProvisionalIdentity, type PublicProvisionalUser } from '@tanker/identity';

import { VerificationNeeded } from '../../errors.internal';

import { Client, b64RequestObject } from '../../Network/Client';
import LocalUser, { type PrivateProvisionalKeys } from '../LocalUser/LocalUser';
import { formatVerificationRequest } from '../requests';
import { statuses, type EmailVerificationMethod, type Status, type EmailVerification, type OIDCVerification } from '../types';
import UserAccessor from '../../Users/UserAccessor';

import { provisionalIdentityClaimFromBlock } from './Serialize';
import { verifyProvisionalIdentityClaim } from './Verify';

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
  _localUser: LocalUser;
  _userAccessor: UserAccessor;
  _provisionalIdentity: SecretProvisionalIdentity;

  constructor(
    client: Client,
    localUser: LocalUser,
    userAccessor: UserAccessor,
  ) {
    this._client = client;
    this._localUser = localUser;
    this._userAccessor = userAccessor;
  }

  async attachProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity): Promise<{ status: Status, verificationMethod?: EmailVerificationMethod }> {
    await this._refreshProvisionalPrivateKeys();
    const hasClaimed = this._localUser.hasProvisionalUserKey(utils.fromBase64(provisionalIdentity.public_encryption_key));

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

    if (verification.email && this._provisionalIdentity.value !== verification.email)
      throw new InvalidArgument('"verification.email" does not match provisional identity');

    if (verification.oidcIdToken) {
      let jwtPayload;
      try {
        jwtPayload = JSON.parse(utils.toString(utils.fromBase64(verification.oidcIdToken.split('.')[1])));
      } catch (e) {
        throw new InvalidArgument('Failed to parse "verification.oidcIdToken"');
      }
      if (this._provisionalIdentity.value !== jwtPayload.email)
        throw new InvalidArgument('"verification.oidcIdToken" does not match provisional identity');
    }

    const tankerKeys = await this._verifyAndGetProvisionalIdentityKeys(verification);
    if (tankerKeys)
      await this._claimProvisionalIdentity(this._provisionalIdentity, tankerKeys);

    delete this._provisionalIdentity;
  }

  async getPrivateProvisionalKeys(appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): Promise<?PrivateProvisionalKeys> {
    const provisionalUserKeyPairs = this._localUser.findProvisionalUserKey(appPublicSignatureKey, tankerPublicSignatureKey);

    if (provisionalUserKeyPairs) {
      return provisionalUserKeyPairs;
    }
    await this._refreshProvisionalPrivateKeys();
    return this._localUser.findProvisionalUserKey(appPublicSignatureKey, tankerPublicSignatureKey);
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
      const authorDevice = await this._userAccessor.fetchDeviceByDeviceId(claimEntry.author);
      verifyProvisionalIdentityClaim(claimEntry, authorDevice, this._localUser.userId);

      const privateProvisionalKeys = this._decryptPrivateProvisionalKeys(claimEntry.recipient_user_public_key, claimEntry.encrypted_provisional_identity_private_keys);

      await this._localUser.storeProvisionalUserKey(
        claimEntry.app_provisional_identity_signature_public_key,
        claimEntry.tanker_provisional_identity_signature_public_key,
        privateProvisionalKeys
      );
    }
  }

  _decryptPrivateProvisionalKeys(recipientUserPublicKey: Uint8Array, encryptedPrivateProvisionalKeys: Uint8Array): PrivateProvisionalKeys {
    const userKeyPair = this._localUser.findUserKey(recipientUserPublicKey);

    const provisionalUserPrivateKeys = tcrypto.sealDecrypt(encryptedPrivateProvisionalKeys, userKeyPair);
    const appEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(0, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    const tankerEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    return { appEncryptionKeyPair, tankerEncryptionKeyPair };
  }

  async _verifyAndGetProvisionalIdentityKeys(verification: EmailVerification | OIDCVerification): Promise<?TankerProvisionalKeys> {
    const result = await this._client.send('get provisional identity', b64RequestObject({
      verification: formatVerificationRequest(verification, this._localUser),
    }));
    return tankerProvisionalKeys(result);
  }

  async _claimProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity, tankerKeys: TankerProvisionalKeys): Promise<void> {
    await this._updateLocalUser();
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
  }

  _updateLocalUser = async () => {
    try {
      const localUserBlocks = await this._client.send('get my user blocks');
      await this._localUser.initializeWithBlocks(localUserBlocks);
    } catch (e) {
      if (e instanceof DeviceRevoked) {
        throw new InternalError('Cannot update local user: device revoked');
      }
    }
  }
}
