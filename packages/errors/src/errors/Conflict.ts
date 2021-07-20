import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class Conflict extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('Conflict', errorInfo);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, Conflict.prototype);
  }
}
