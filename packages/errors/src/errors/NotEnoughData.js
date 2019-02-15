// @flow
import TankerError from '../TankerError';

export default class NotEnoughData extends TankerError {
  constructor(message: string) {
    const msg = `Not enough data available: ${message}`;
    super('not_enough_data', msg);
  }
}
