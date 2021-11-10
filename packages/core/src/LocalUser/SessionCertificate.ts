import { InternalError, InvalidArgument } from '@tanker/errors';
import { generichash, utils, tcrypto, number } from '@tanker/crypto';
import varint from 'varint';
import type { VerificationMethod, VerificationWithToken } from './types';
import { isPreverifiedVerification, isPreverifiedVerificationMethod } from './types';
import { getStaticArray, unserializeGeneric } from '../Blocks/Serialize';
import { NATURE_KIND, preferredNature } from '../Blocks/Nature';

export const enum VerificationMethodTypes {
  email = 1,
  passphrase = 2,
  verificationKey = 3,
  oidcIdToken = 4,
  phoneNumber = 5,
}

const verificationMethodsFromName = {
  email: VerificationMethodTypes.email,
  passphrase: VerificationMethodTypes.passphrase,
  verificationKey: VerificationMethodTypes.verificationKey,
  oidcIdToken: VerificationMethodTypes.oidcIdToken,
  phoneNumber: VerificationMethodTypes.phoneNumber,
};

const VERIFICATION_METHOD_TYPES_INT: Array<VerificationMethodTypes> = [
  VerificationMethodTypes.email,
  VerificationMethodTypes.passphrase,
  VerificationMethodTypes.verificationKey,
  VerificationMethodTypes.oidcIdToken,
  VerificationMethodTypes.phoneNumber,
];

export type SessionCertificateRecord = {
  timestamp: number;
  verification_method_type: VerificationMethodTypes;
  verification_method_target: Uint8Array;
  // If you're wondering, this one is currently unused (future compat)
  session_public_signature_key: Uint8Array;
};

function verificationToVerificationMethod(verification: VerificationWithToken): VerificationMethod {
  if ('email' in verification)
    return {
      type: 'email',
      email: verification!.email,
    };
  if ('phoneNumber' in verification)
    return {
      type: 'phoneNumber',
      phoneNumber: verification!.phoneNumber,
    };
  if ('passphrase' in verification)
    return {
      type: 'passphrase',
    };
  if ('verificationKey' in verification)
    return {
      type: 'verificationKey',
    };
  if ('oidcIdToken' in verification)
    return {
      type: 'oidcIdToken',
    };
  throw new InvalidArgument('verification', 'unknown verification method used in verification', verification);
}

export const serializeSessionCertificate = (sessionCertificate: SessionCertificateRecord): Uint8Array => {
  if (!(sessionCertificate.verification_method_type in VERIFICATION_METHOD_TYPES_INT))
    throw new InternalError('Assertion error: invalid session certificate method type');
  if (sessionCertificate.verification_method_target.length !== tcrypto.HASH_SIZE)
    throw new InternalError('Assertion error: invalid session certificate method target size');
  if (sessionCertificate.session_public_signature_key.length !== tcrypto.SIGNATURE_PUBLIC_KEY_SIZE)
    throw new InternalError('Assertion error: invalid session public signature key size');

  return utils.concatArrays(
    sessionCertificate.session_public_signature_key,
    number.toUint64le(sessionCertificate.timestamp),
    new Uint8Array(varint.encode(sessionCertificate.verification_method_type)),
    sessionCertificate.verification_method_target,
  );
};

export const unserializeSessionCertificate = (payload: Uint8Array): SessionCertificateRecord => unserializeGeneric(payload, [
  (d, o) => getStaticArray(d, tcrypto.SIGNATURE_PUBLIC_KEY_SIZE, o, 'session_public_signature_key'),
  (d, o) => ({
    timestamp: number.fromUint64le(d.subarray(o, o + 8)),
    newOffset: o + 8,
  }),
  (d, o) => ({
    verification_method_type: varint.decode(d, o),
    newOffset: o + varint.decode.bytes,
  }),
  (d, o) => getStaticArray(d, tcrypto.HASH_SIZE, o, 'verification_method_target'),
]);

export const makeSessionCertificate = (verification: VerificationWithToken) => {
  if (isPreverifiedVerification(verification)) {
    throw new InvalidArgument('cannot make session certificate with preverified verification method type');
  }
  const verifMethod = verificationToVerificationMethod(verification);
  let verifTarget;

  if (verifMethod.type === 'email') {
    // at this point old email verification method (without encrypted email stored) are already handled (error thrown)
    verifTarget = generichash(utils.fromString(verifMethod.email!));
  } else if (verifMethod.type === 'phoneNumber') {
    verifTarget = generichash(utils.fromString(verifMethod.phoneNumber));
  } else if (isPreverifiedVerificationMethod(verifMethod)) {
    throw new InvalidArgument('cannot make session certificate with preverified verification method type');
  } else {
    verifTarget = new Uint8Array(tcrypto.HASH_SIZE);
  }

  // Note: We don't currently _do_ anything with this one, but we added it to the block format for future compat...
  const signatureKeyPair = tcrypto.makeSignKeyPair();
  const payload = serializeSessionCertificate({
    timestamp: Math.floor(Date.now() / 1000),
    verification_method_type: verificationMethodsFromName[verifMethod.type],
    verification_method_target: verifTarget,
    session_public_signature_key: signatureKeyPair.publicKey,
  });

  return {
    payload,
    nature: preferredNature(NATURE_KIND.session_certificate),
  };
};
