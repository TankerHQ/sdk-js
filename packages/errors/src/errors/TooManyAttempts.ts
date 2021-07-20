import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class TooManyAttempts extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('TooManyAttempts', errorInfo);
  }
}
