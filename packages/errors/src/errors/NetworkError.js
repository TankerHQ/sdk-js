// @flow
import { TankerError } from '../TankerError';

export class NetworkError extends TankerError {
  constructor(message: string = 'Network error') {
    super('NetworkError', message);
  }
}
