// @flow
import TankerError from '../TankerError';

function getTypeAsString(value) {
  // only check the built-ins we care about in the API
  if (value instanceof Array)
    return 'Array';
  else if (value instanceof Uint8Array)
    return 'Uint8Array';

  return typeof value;
}

export default class InvalidArgument extends TankerError {
  constructor(name: string, expectedType: string, value: any) {
    let quotedValue;
    try {
      quotedValue = JSON.stringify(value);
    } catch (e) {
      quotedValue = value;
    }

    const foundType = getTypeAsString(value);

    super('invalid_argument', `name: ${name} (${expectedType}), value: ${quotedValue} (${foundType})`);
  }
}
