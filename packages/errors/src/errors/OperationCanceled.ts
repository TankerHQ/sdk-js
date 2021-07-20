import type { ErrorInfo } from '../ErrorInfo';
import { TankerError } from '../TankerError';

export class OperationCanceled extends TankerError {
  declare reason?: Error;

  constructor(errorInfo?: ErrorInfo, reason?: Error) {
    super('OperationCanceled', errorInfo || 'Operation canceled');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, OperationCanceled.prototype);
    this.reason = reason;
  }

  override getMessage(): string {
    let message = super.getMessage();
    if (this.reason) {
      message = `${message}. Cancelation reason: ${this.reason}`;
    }
    return message;
  }
}
