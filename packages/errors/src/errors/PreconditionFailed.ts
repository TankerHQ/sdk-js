import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class PreconditionFailed extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('PreconditionFailed', errorInfo);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, PreconditionFailed.prototype);
  }
}
