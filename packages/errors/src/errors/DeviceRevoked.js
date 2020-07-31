// @flow
import { TankerError } from '../TankerError';

export class DeviceRevoked extends TankerError {
  constructor(message: string = 'This device was revoked') {
    super('DeviceRevoked', message);
  }
}
