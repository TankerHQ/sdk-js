import type { Status } from '../Session/status';
import type { ProvisionalVerificationMethod } from '../LocalUser/types';

export type AttachResult = { status: Status; verificationMethod?: ProvisionalVerificationMethod; };
