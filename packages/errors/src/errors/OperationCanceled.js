// @flow
import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class OperationCanceled extends TankerError {
  declare next: ?Error;

  constructor(errorInfo?: ErrorInfo, next?: Error) {
    super('OperationCanceled', errorInfo || 'Operation canceled');
    this.next = next;
  }

  set message(msg: string) {
    super.message = msg;
  }

  get message() {
    let message = super.message;
    if (this.next) {
      message = `${message}. Previous error: ${this.next.toString()}`;
    }
    return message;
  }
}
