// @flow
import { TankerError } from '../TankerError';

export class Conflict extends TankerError {
  constructor(message: string) {
    super('Conflict', message);
  }
}
