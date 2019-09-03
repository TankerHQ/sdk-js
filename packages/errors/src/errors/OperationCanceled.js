// @flow
import { TankerError } from '../TankerError';

export class OperationCanceled extends TankerError {
  constructor(message: string = 'Operation canceled') {
    super('OperationCanceled', message);
  }
}
