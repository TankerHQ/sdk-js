import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class UpgradeRequired extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    if (typeof errorInfo === 'string') {
      super('UpgradeRequired', `Tanker must be upgraded to a newer version to continue: ${errorInfo}`);
    } else {
      super('UpgradeRequired', errorInfo);
    }
  }
}
