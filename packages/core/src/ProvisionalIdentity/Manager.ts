import type { b64string } from '@tanker/crypto';
import { generichash, tcrypto, utils } from '@tanker/crypto';
import { InternalError, InvalidArgument, PreconditionFailed } from '@tanker/errors';
import type { SecretProvisionalIdentity, PublicProvisionalIdentity, PublicProvisionalUser } from '../Identity';

import type { Client } from '../Network/Client';
import type { TankerProvisionalIdentityResponse } from '../Network/types';
import type { PrivateProvisionalKeys, LocalUserManager } from '../LocalUser/Manager';

import type KeyStore from '../LocalUser/KeyStore';
import { formatProvisionalKeysRequest, formatVerificationRequest } from '../LocalUser/requests';
import type {
  EmailVerification,
  EmailVerificationMethod,
  OIDCVerification, PhoneNumberVerification, PhoneNumberVerificationMethod, ProvisionalVerification,
  ProvisionalVerificationMethod,
} from '../LocalUser/types';
import { Status } from '../Session/status';
import type UserManager from '../Users/Manager';

import { provisionalIdentityClaimFromBlock, makeProvisionalIdentityClaim } from './Serialize';
import { verifyProvisionalIdentityClaim } from './Verify';
import {
  identityTargetToVerificationMethodType,
  isProvisionalIdentity,
} from '../Identity';

type TankerProvisionalKeys = { tankerSignatureKeyPair: tcrypto.SodiumKeyPair; tankerEncryptionKeyPair: tcrypto.SodiumKeyPair; };

const toTankerProvisionalKeys = (serverResult: TankerProvisionalIdentityResponse) => ({
  tankerSignatureKeyPair: {
    privateKey: utils.fromBase64(serverResult.private_signature_key),
    publicKey: utils.fromBase64(serverResult.public_signature_key),
  },
  tankerEncryptionKeyPair: {
    privateKey: utils.fromBase64(serverResult.private_encryption_key),
    publicKey: utils.fromBase64(serverResult.public_encryption_key),
  },
});

export default class ProvisionalIdentityManager {
  _client: Client;
  _keyStore: KeyStore;
  _localUserManager: LocalUserManager;
  _userManager: UserManager;
  _provisionalIdentity?: SecretProvisionalIdentity;

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

  async attachProvisionalIdentity(provisionalIdentity: SecretProvisionalIdentity): Promise<{ status: Status, verificationMethod?: ProvisionalVerificationMethod }> {
    let hasClaimed = this._localUserManager.hasProvisionalUserKey(utils.fromBase64(provisionalIdentity.public_encryption_key));

    if (!hasClaimed) {
      await this.refreshProvisionalPrivateKeys();
      hasClaimed = this._localUserManager.hasProvisionalUserKey(utils.fromBase64(provisionalIdentity.public_encryption_key));
    }

    if (hasClaimed) {
      return { status: Status.READY };
    }

    if (!isProvisionalIdentity(provisionalIdentity)) {
      // @ts-expect-error Target is already checked when deserializing the provisional identity
      throw new InternalError(`Assertion error: unsupported provisional identity target: ${provisionalIdentity.target}`);
    }

    const verificationMethod = await this._getVerificationMethodForProvisional(provisionalIdentity);
    if (verificationMethod) {
      const attachSuccess = await this._attachProvisionalWithVerifMethod(provisionalIdentity, verificationMethod);
      if (attachSuccess) {
        return { status: Status.READY };
      }
    }

    this._provisionalIdentity = provisionalIdentity;
    return {
      status: Status.IDENTITY_VERIFICATION_NEEDED,
      verificationMethod: this._verificationMethodFromIdentity(provisionalIdentity),
    };
  }

  async _getVerificationMethodForProvisional(provisionalIdentity: SecretProvisionalIdentity): Promise<ProvisionalVerificationMethod | null> {
    const methodType = identityTargetToVerificationMethodType(provisionalIdentity.target);
    const verificationMethods = await this._localUserManager.getVerificationMethods();
    // @ts-expect-error We select the verificationMethod using the provisional target
    return verificationMethods.find(method => method.type === methodType);
  }

  async _attachProvisionalWithVerifMethod(provisionalIdentity: SecretProvisionalIdentity, verificationMethod: ProvisionalVerificationMethod): Promise<boolean> {
    const expected = {
      email: (verificationMethod as EmailVerificationMethod).email || null,
      phone_number: (verificationMethod as PhoneNumberVerificationMethod).phoneNumber || null,
    };

    // When the target is also registered as a verification method:
    //   - we can directly claim if keys found
    //   - we know that there's nothing to claim if keys not found
    if (expected[provisionalIdentity.target] === provisionalIdentity.value) {
      const tankerKeys = await this._getProvisionalIdentityKeys(provisionalIdentity);
      if (tankerKeys) {
        await this._claimProvisionalIdentity(provisionalIdentity, tankerKeys);
      }
      return true;
    }

    return false;
  }

  _verificationMethodFromIdentity(provisionalIdentity: SecretProvisionalIdentity): ProvisionalVerificationMethod {
    if (provisionalIdentity.target === 'email') {
      return {
        type: 'email',
        email: provisionalIdentity.value,
      };
    }
    if (provisionalIdentity.target === 'phone_number') {
      return {
        type: 'phoneNumber',
        phoneNumber: provisionalIdentity.value,
      };
    }
    // Target is already checked when deserializing the provisional identity
    throw new InternalError(`Assertion error: unsupported provisional identity target: ${provisionalIdentity.target}`);
  }

  async verifyProvisionalIdentity(verification: ProvisionalVerification | OIDCVerification) {
    if (!('email' in verification) && !('phoneNumber' in verification) && !('oidcIdToken' in verification))
      throw new InternalError(`Assertion error: unsupported verification method for provisional identity: ${JSON.stringify(verification)}`);

    if (!this._provisionalIdentity)
      throw new PreconditionFailed('Cannot call verifyProvisionalIdentity() without having called attachProvisionalIdentity() before');

    const provisionalIdentity = this._provisionalIdentity;

    if ('oidcIdToken' in verification) {
      let jwtPayload;
      try {
        jwtPayload = JSON.parse(utils.toString(utils.fromSafeBase64(verification.oidcIdToken.split('.')[1]!)));
      } catch (e) {
        throw new InvalidArgument('Failed to parse "verification.oidcIdToken"');
      }
      if (jwtPayload.email !== provisionalIdentity.value)
        throw new InvalidArgument('"verification.oidcIdToken" does not match provisional identity');
    } else if (provisionalIdentity.target === 'email' && (verification as EmailVerification).email !== provisionalIdentity.value) {
      throw new InvalidArgument('"verification.email" does not match provisional identity');
    } else if (provisionalIdentity.target === 'phone_number' && (verification as PhoneNumberVerification).phoneNumber !== provisionalIdentity.value) {
      throw new InvalidArgument('"verification.phoneNumber" does not match provisional identity');
    }

    const tankerKeys = await this._getProvisionalIdentityKeys(provisionalIdentity, verification);
    await this._claimProvisionalIdentity(provisionalIdentity, tankerKeys);

    delete this._provisionalIdentity;
  }

  findPrivateProvisionalKeys(appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): PrivateProvisionalKeys | null {
    return this._localUserManager.findProvisionalUserKey(appPublicSignatureKey, tankerPublicSignatureKey);
  }

  async getPrivateProvisionalKeys(appPublicSignatureKey: Uint8Array, tankerPublicSignatureKey: Uint8Array): Promise<PrivateProvisionalKeys | null> {
    let provisionalEncryptionKeyPairs = this.findPrivateProvisionalKeys(appPublicSignatureKey, tankerPublicSignatureKey);
    if (!provisionalEncryptionKeyPairs) {
      await this.refreshProvisionalPrivateKeys();
      provisionalEncryptionKeyPairs = this.findPrivateProvisionalKeys(appPublicSignatureKey, tankerPublicSignatureKey);
    }
    return provisionalEncryptionKeyPairs;
  }

  async getProvisionalUsers(provisionalIdentitiesWithDup: Array<PublicProvisionalIdentity>): Promise<Array<PublicProvisionalUser>> {
    if (provisionalIdentitiesWithDup.length === 0)
      return [];

    const appKeys: Set<b64string> = new Set();
    const provisionalIdentities: Array<PublicProvisionalIdentity> = [];
    for (const id of provisionalIdentitiesWithDup) {
      if (!appKeys.has(id.public_signature_key)) {
        appKeys.add(id.public_signature_key);
        provisionalIdentities.push(id);
      }
    }

    const emailHashedValues = [];
    const phoneNumberHashedValues = [];
    for (const provisionalIdentity of provisionalIdentities) {
      switch (provisionalIdentity.target) {
        case 'email':
          emailHashedValues.push(generichash(utils.fromString(provisionalIdentity.value)));
          break;
        case 'hashed_email':
          emailHashedValues.push(utils.fromBase64(provisionalIdentity.value));
          break;
        case 'hashed_phone_number':
          phoneNumberHashedValues.push(utils.fromBase64(provisionalIdentity.value));
          break;
        default:
          throw new InvalidArgument(`Unsupported provisional identity target: ${provisionalIdentity.target}`);
      }
    }

    const tankerPublicKeysByHashedValues = await this._client.getPublicProvisionalIdentities(emailHashedValues, phoneNumberHashedValues);
    const tankerPublicKeysByEmailHash = tankerPublicKeysByHashedValues.hashedEmails;
    const tankerPublicKeysByPhoneNumberHash = tankerPublicKeysByHashedValues.hashedPhoneNumbers;

    return provisionalIdentities.map(provisionalIdentity => {
      let tankerPublicKeys;
      if (provisionalIdentity.target === 'email') {
        const emailHash = utils.toBase64(generichash(utils.fromString(provisionalIdentity.value)));
        tankerPublicKeys = tankerPublicKeysByEmailHash[emailHash];
      } else if (provisionalIdentity.target === 'hashed_email') {
        tankerPublicKeys = tankerPublicKeysByEmailHash[provisionalIdentity.value];
      } else if (provisionalIdentity.target === 'hashed_phone_number') {
        tankerPublicKeys = tankerPublicKeysByPhoneNumberHash[provisionalIdentity.value];
      } else {
        throw new InternalError(`Assertion error: Unreachable if targets have been validated before doing the request (target ${provisionalIdentity.target})`);
      }
      if (!tankerPublicKeys) {
        throw new InternalError(`Assertion error: couldn't find or generate tanker public keys for provisional identity: ${provisionalIdentity.value}`);
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

  async _getProvisionalIdentityKeys(provIdentity: SecretProvisionalIdentity, verification?: ProvisionalVerification | OIDCVerification): Promise<TankerProvisionalKeys> {
    let tankerProvisionalKeysReply: TankerProvisionalIdentityResponse;

    const localUser = this._localUserManager.localUser;
    if (verification) {
      tankerProvisionalKeysReply = await this._client.getTankerProvisionalKeysWithVerif({
        verification: formatVerificationRequest(verification, localUser, provIdentity),
      });
    } else {
      tankerProvisionalKeysReply = await this._client.getTankerProvisionalKeysFromSession(
        formatProvisionalKeysRequest(provIdentity, localUser),
      );
    }

    return toTankerProvisionalKeys(tankerProvisionalKeysReply);
  }

  async refreshProvisionalPrivateKeys() {
    const claimBlocks: string[] = await this._client.getProvisionalIdentityClaims();

    const claimEntries = claimBlocks.map(block => provisionalIdentityClaimFromBlock(block));
    const authorDevices = claimEntries.map(entry => entry.author);
    const authorDeviceKeysMap = await this._userManager.getDeviceKeysByDevicesIds(authorDevices, { isLight: true });

    for (let i = 0, length = claimEntries.length; i < length; i++) {
      const claimEntry = claimEntries[i]!;
      const authorDevicePublicSignatureKey = authorDeviceKeysMap.get(utils.toBase64(authorDevices[i]!));
      if (!authorDevicePublicSignatureKey) {
        throw new InternalError('refreshProvisionalPrivateKeys: author device should have a public signature key');
      }
      verifyProvisionalIdentityClaim(claimEntry, authorDevicePublicSignatureKey, this._localUserManager.localUser.userId);

      const privateProvisionalKeys = await this._decryptPrivateProvisionalKeys(claimEntry.recipient_user_public_key, claimEntry.encrypted_provisional_identity_private_keys);

      await this._localUserManager.addProvisionalUserKey(
        claimEntry.app_provisional_identity_signature_public_key,
        claimEntry.tanker_provisional_identity_signature_public_key,
        privateProvisionalKeys,
      );
    }
  }

  async _decryptPrivateProvisionalKeys(recipientUserPublicKey: Uint8Array, encryptedPrivateProvisionalKeys: Uint8Array): Promise<PrivateProvisionalKeys> {
    const userKeyPair = (await this._localUserManager.findUserKey(recipientUserPublicKey))!;

    const provisionalUserPrivateKeys = tcrypto.sealDecrypt(encryptedPrivateProvisionalKeys, userKeyPair);
    const appEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(0, tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    const tankerEncryptionKeyPair = tcrypto.getEncryptionKeyPairFromPrivateKey(new Uint8Array(provisionalUserPrivateKeys.subarray(tcrypto.ENCRYPTION_PUBLIC_KEY_SIZE)));

    return {
      appEncryptionKeyPair,
      tankerEncryptionKeyPair,
    };
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

    const {
      userId,
      deviceId,
      currentUserKey,
    } = this._localUserManager.localUser;
    const {
      payload,
      nature,
    } = makeProvisionalIdentityClaim(userId, deviceId, currentUserKey.publicKey, provisionalUserKeys);

    const block = this._localUserManager.localUser.makeBlock(payload, nature);

    await this._client.claimProvisionalIdentity({ provisional_identity_claim: block });
  }
}
