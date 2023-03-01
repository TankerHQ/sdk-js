import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class TooManyRequests extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('TooManyRequests', errorInfo);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TooManyRequests.prototype);
  }
}
