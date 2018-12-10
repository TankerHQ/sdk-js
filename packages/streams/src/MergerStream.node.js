// @flow
import ResizerStream from './ResizerStream';

export default class MergerStream extends ResizerStream {
  constructor() {
    // Note: can't use Infinity as it will be forwarded to the writableHighWaterMark option
    super(Number.MAX_SAFE_INTEGER);
  }
}
