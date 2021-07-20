import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class NetworkError extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('NetworkError', errorInfo || 'Network error');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
