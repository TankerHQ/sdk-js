import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class NetworkError extends TankerError {
  constructor(errorInfo?: ErrorInfo, next?: Error) {
    super('NetworkError', errorInfo || 'Network error');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, NetworkError.prototype);

    this.next = next;
  }
}
