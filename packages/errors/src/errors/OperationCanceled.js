// @flow
import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class OperationCanceled extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('OperationCanceled', errorInfo || 'Operation canceled');
  }
}
