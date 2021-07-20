import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class IdentityAlreadyAttached extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('IdentityAlreadyAttached', errorInfo || 'Identity already attached');
  }
}
