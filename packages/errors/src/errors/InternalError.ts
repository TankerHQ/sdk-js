import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class InternalError extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('InternalError', errorInfo);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}
