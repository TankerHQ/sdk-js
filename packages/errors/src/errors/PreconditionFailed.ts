import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class PreconditionFailed extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('PreconditionFailed', errorInfo);
  }
}
