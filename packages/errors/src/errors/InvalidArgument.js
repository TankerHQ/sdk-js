// @flow
import TankerError from '../TankerError';
import { safePrintType, safePrintValue } from '../print';

export default class InvalidArgument extends TankerError {
  constructor(name: string, expectedType: string, value: any) {
    const message = `name: ${name} (${expectedType}), value: ${safePrintValue(value)} (${safePrintType(value)})`;
    super('InvalidArgument', message);
  }
}
