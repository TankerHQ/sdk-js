// @flow
import { TankerError } from '../TankerError';

export class DeviceRevoked extends TankerError {
  constructor() {
    super('DeviceRevoked', 'This device was revoked');
  }
}
