// @flow
import { TankerError } from '../TankerError';

export class InvalidVerification extends TankerError {
  constructor(message: string) {
    super('InvalidVerification', message);
  }
}
