import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class ExpiredVerification extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('ExpiredVerification', errorInfo);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ExpiredVerification.prototype);
  }
}
