import { Conflict, DeviceRevoked, ExpiredVerification, GroupTooBig, IdentityAlreadyAttached, InternalError, InvalidArgument, InvalidVerification, PreconditionFailed, TooManyAttempts, UpgradeRequired } from '@tanker/errors';

const apiCodeErrorMap = {
  blocked: PreconditionFailed,
  conflict: Conflict,
  device_revoked: DeviceRevoked,
  group_too_big: GroupTooBig,
  invalid_delegation_signature: InvalidVerification,
  invalid_oidc_id_token: InvalidVerification,
  invalid_passphrase: InvalidVerification,
  invalid_token: PreconditionFailed, // invalid or expired access token
  invalid_verification_code: InvalidVerification,
  provisional_identity_already_attached: IdentityAlreadyAttached,
  too_many_attempts: TooManyAttempts,
  verification_code_expired: ExpiredVerification,
  verification_code_not_found: InvalidVerification,
  verification_method_not_set: PreconditionFailed,
  verification_key_not_found: PreconditionFailed,
  upgrade_required: UpgradeRequired,
  not_a_user_group_member: InvalidArgument,
  empty_user_group: InvalidArgument,
  missing_user_group_members: InvalidArgument,
};

export const genericErrorHandler = (apiMethod: string, apiRoute: string, error: Record<string, any>) => {
  const { code: apiCode, message, status: httpStatus, trace_id: traceId } = error;
  const apiError = { apiCode, apiMethod, apiRoute, httpStatus, message, traceId };

  const ErrorClass = apiCodeErrorMap[apiError.apiCode] || InternalError;

  if (ErrorClass === InvalidArgument) {
    throw new ErrorClass(apiError.message);
  } else {
    throw new ErrorClass(apiError);
  }
};
