// @flow
import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class GroupTooBig extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('GroupTooBig', errorInfo);
  }
}
