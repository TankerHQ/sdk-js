// @flow
import { TankerError } from '../TankerError';

export class GroupTooBig extends TankerError {
  constructor(message: string) {
    super('GroupTooBig', message);
  }
}
