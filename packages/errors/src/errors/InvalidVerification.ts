import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class InvalidVerification extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('InvalidVerification', errorInfo);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, InvalidVerification.prototype);
  }
}
