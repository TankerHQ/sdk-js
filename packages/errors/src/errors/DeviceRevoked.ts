import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class DeviceRevoked extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('DeviceRevoked', errorInfo || 'This device was revoked');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, DeviceRevoked.prototype);
  }
}
