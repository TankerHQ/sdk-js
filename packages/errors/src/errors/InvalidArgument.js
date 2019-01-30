// @flow
import TankerError from '../TankerError';
import { safePrintType, safePrintValue } from '../print';

export default class InvalidArgument extends TankerError {
  constructor(name: string, expectedType: string, value: any) {
    super('invalid_argument', `name: ${name} (${expectedType}), value: ${safePrintValue(value)} (${safePrintType(value)})`);
  }
}
