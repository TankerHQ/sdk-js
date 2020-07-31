// @flow
import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class Conflict extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('Conflict', errorInfo);
  }
}
