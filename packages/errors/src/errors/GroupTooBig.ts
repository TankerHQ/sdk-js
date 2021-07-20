import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class GroupTooBig extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('GroupTooBig', errorInfo);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, GroupTooBig.prototype);
  }
}
