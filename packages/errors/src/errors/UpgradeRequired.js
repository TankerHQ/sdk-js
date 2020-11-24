// @flow
import type { ErrorMessage } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class UpgradeRequired extends TankerError {
  constructor(message: ErrorMessage) {
    super('UpgradeRequired', `Tanker must be upgraded to a newer version to continue: ${message}`);
  }
}
