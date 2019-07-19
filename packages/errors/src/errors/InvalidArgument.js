// @flow
import { TankerError } from '../TankerError';
import { safePrintType, safePrintValue } from '../print';

export class InvalidArgument extends TankerError {
  constructor(name: string, expectedType?: string, value?: any) {
    let message: string;
    if (expectedType) {
      message = `name: ${name} (${expectedType}), value: ${safePrintValue(value)} (${safePrintType(value)})`;
    } else {
      message = name;
    }
    super('InvalidArgument', message);
  }
}
