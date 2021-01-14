// @flow
import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class UnsupportedGroupVersion extends TankerError {
  constructor(errorInfo?: ErrorInfo) {
    super('UnsupportedGroupVersion', errorInfo || 'Group block version too old or unsupported');
  }
}
