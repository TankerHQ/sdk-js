import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class InvalidVerification extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('InvalidVerification', errorInfo);
  }
}
