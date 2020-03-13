// @flow

import { generichash, tcrypto, utils } from '@tanker/crypto';
import { InternalError, InvalidArgument, PreconditionFailed } from '@tanker/errors';
import type { SecretProvisionalIdentity, PublicProvisionalIdentity, PublicProvisionalUser } from '@tanker/identity';

import type { Client } from '../Network/Client';
import LocalUserManager, { type PrivateProvisionalKeys } from '../LocalUser/Manager';

import KeyStore from '../LocalUser/KeyStore';
import { formatVerificationRequest } from '../LocalUser/requests';
import type { EmailVerificationMethod, EmailVerification, OIDCVerification } from '../LocalUser/types';
import { statuses, type Status } from '../Session/status';
import UserManager from '../Users/Manager';

import { provisionalIdentityClaimFromBlock, makeProvisionalIdentityClaim } from './Serialize';
import { verifyProvisionalIdentityClaim } from './Verify';

type TankerProvisionalKeys = {| tankerSignatureKeyPair: tcrypto.SodiumKeyPair, tankerEncryptionKeyPair: tcrypto.SodiumKeyPair |};

const tankerProvisionalKeys = (serverResult) => ({
  tankerSignatureKeyPair: {
    privateKey: utils.fromBase64(serverResult.private_signature_key),
    publicKey: utils.fromBase64(serverResult.public_signature_key),
  },
  tankerEncryptionKeyPair: {
    privateKey: utils.fromBase64(serverResult.private_encryption_key),
    publicKey: utils.fromBase64(serverResult.public_encryption_key),
  }
});

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
      await this.refreshProvisionalPrivateKeys();
      hasClaimed = this._localUserManager.hasProvisionalUserKey(utils.fromBase64(provisionalIdentity.public_encryption_key));
    }

    if (hasClaimed) {
      return { status: statuses.READY };
    }

    if (provisionalIdentity.target !== 'email') {
      // Target is already checked when deserializing the provisional identity
      throw new InternalError(`Assertion error: unsupported provisional identity target: ${provisionalIdentity.target}`);
    }

    const email = provisionalIdentity.value;

    const verificationMethods = await this._localUserManager.getVerificationMethods();

    const emailMethod = verificationMethods.find(method => method.type === 'email');

    // When email is also registered as a verification method:
    //   - we can directly claim if keys found
    //   - we know that there's nothing to claim if keys not found
    if (emailMethod && emailMethod.email === email) {
      const tankerKeys = await this._getProvisionalIdentityKeys(email);
      if (tankerKeys) {
        await this._claimProvisionalIdentity(provisionalIdentity, tankerKeys);
      }
      return { status: statuses.READY };
    }

    this._provisionalIdentity = provisionalIdentity;

    return {
      status: statuses.IDENTITY_VERIFICATION_NEEDED,
      verificationMethod: { type: 'email', email },
    };
  }

  async verifyProvisionalIdentity(verification: EmailVerification | OIDCVerification) {
    if (!('email' in verification) && !('oidcIdToken' in verification))
      throw new InternalError(`Assertion error: unsupported verification method for provisional identity: ${JSON.stringify(verification)}`);

    if (!this._provisionalIdentity)
      throw new PreconditionFailed('Cannot call verifyProvisionalIdentity() without having called attachProvisionalIdentity() before');

    const provisionalIdentity = this._provisionalIdentity;
    const email = provisionalIdentity.value;

    if (verification.email && verification.email !== email)
      throw new InvalidArgument('"verification.email" does not match provisional identity');

    if (verification.oidcIdToken) {
      let jwtPayload;
      try {
        jwtPayload = JSON.parse(utils.toString(utils.fromSafeBase64(verification.oidcIdToken.split('.')[1])));
      } catch (e) {
        throw new InvalidArgument('Failed to parse "verification.oidcIdToken"');
      }
      if (jwtPayload.email !== email)
        throw new InvalidArgument('"verification.oidcIdToken" does not match provisional identity');
    }

    const tankerKeys = await this._getProvisionalIdentityKeys(email, verification);
    await this._claimProvisionalIdentity(provisionalIdentity, tankerKeys);

    delete this._provisionalIdentity;
  }

  findPrivateProvisionalKeys(appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): ?PrivateProvisionalKeys {
    return this._localUserManager.findProvisionalUserKey(appPublicSignatureKey, tankerPublicSignatureKey);
  }

  async getPrivateProvisionalKeys(appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): Promise<?PrivateProvisionalKeys> {
    let provisionalEncryptionKeyPairs = this.findPrivateProvisionalKeys(appPublicSignatureKey, tankerPublicSignatureKey);
    if (!provisionalEncryptionKeyPairs) {
      await this.refreshProvisionalPrivateKeys();
      provisionalEncryptionKeyPairs = this.findPrivateProvisionalKeys(appPublicSignatureKey, tankerPublicSignatureKey);
    }
    return provisionalEncryptionKeyPairs;
  }

  async getProvisionalUsers(provisionalIdentities: Array<PublicProvisionalIdentity>): Promise<Array<PublicProvisionalUser>> {
    if (provisionalIdentities.length === 0)
      return [];

    const provisionalHashedEmails = provisionalIdentities.map(provisionalIdentity => {
      if (provisionalIdentity.target !== 'email') {
        throw new InvalidArgument(`Unsupported provisional identity target: ${provisionalIdentity.target}`);
      }
      return generichash(utils.fromString(provisionalIdentity.value));
    });

    // Note: public keys are returned in an array matching the original order of provisional identities in the request
    const tankerPublicKeysByHashedEmail = await this._client.getPublicProvisionalIdentities(provisionalHashedEmails);

    return provisionalIdentities.map((provisionalIdentity, index) => {
      const b64HashedEmail = utils.toBase64(provisionalHashedEmails[index]);
      const tankerPublicKeys = tankerPublicKeysByHashedEmail[b64HashedEmail];

      if (!tankerPublicKeys) {
        throw new InvalidArgument(`Assertion error: couldn't find or generate tanker public keys for provisional identity: ${provisionalIdentity.value}`);
      }

      return {
        trustchainId: utils.fromBase64(provisionalIdentity.trustchain_id),
        target: provisionalIdentity.target,
        value: provisionalIdentity.value,
        appEncryptionPublicKey: utils.fromBase64(provisionalIdentity.public_encryption_key),
        appSignaturePublicKey: utils.fromBase64(provisionalIdentity.public_signature_key),
        tankerEncryptionPublicKey: utils.fromBase64(tankerPublicKeys.public_encryption_key),
        tankerSignaturePublicKey: utils.fromBase64(tankerPublicKeys.public_signature_key),
      };
    });
  }

  async _getProvisionalIdentityKeys(email: string, verification?: EmailVerification | OIDCVerification): Promise<TankerProvisionalKeys> {
    const urlsafeHashedEmail = utils.toBase64(generichash(utils.fromString(email)));

    let body = null;

    if (verification) {
      body = {
        verification: formatVerificationRequest(verification, this._localUserManager.localUser),
      };
    }

    const provisionalIdentity = await this._client.getProvisionalIdentity(body);

    if (provisionalIdentity.hashed_email !== urlsafeHashedEmail) {
      throw new InternalError(`Assertion error: failed to get tanker keys for provisional identity with email "${email}"`);
    }

    return tankerProvisionalKeys(provisionalIdentity);
  }

  async refreshProvisionalPrivateKeys() {
    const claimBlocks = await this._client.getProvisionalIdentityClaims();

    const claimEntries = claimBlocks.map(block => provisionalIdentityClaimFromBlock(block));
    const authorDevices = claimEntries.map(entry => entry.author);
    const authorDeviceKeysMap = await this._userManager.getDeviceKeysByDevicesIds(authorDevices, { isLight: true });

    for (let i = 0, length = claimEntries.length; i < length; i++) {
      const claimEntry = claimEntries[i];
      const authorDevicePublicSignatureKey = authorDeviceKeysMap.get(utils.toBase64(authorDevices[i]));
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

  async _claimProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity, tankerKeys: TankerProvisionalKeys): Promise<void> {
    await this._localUserManager.updateLocalUser({ isLight: true });

    const appProvisionalUserPrivateSignatureKey = utils.fromBase64(provisionalIdentity.private_signature_key);
    const appProvisionalUserPrivateEncryptionKey = utils.fromBase64(provisionalIdentity.private_encryption_key);

    const provisionalUserKeys = {
      ...tankerKeys,
      appEncryptionKeyPair: tcrypto.getEncryptionKeyPairFromPrivateKey(appProvisionalUserPrivateEncryptionKey),
      appSignatureKeyPair: tcrypto.getSignatureKeyPairFromPrivateKey(appProvisionalUserPrivateSignatureKey),
    };

    const { userId, deviceId, currentUserKey } = this._localUserManager.localUser;
    const { payload, nature } = makeProvisionalIdentityClaim(userId, deviceId, currentUserKey.publicKey, provisionalUserKeys);

    const block = this._localUserManager.localUser.makeBlock(payload, nature);

    await this._client.claimProvisionalIdentity({ provisional_identity_claim: block });
  }
}
