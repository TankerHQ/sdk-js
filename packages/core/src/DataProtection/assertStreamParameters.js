// @flow

import { InvalidArgument } from '../errors';

export function assertStreamParameters(parameters: any) {
  if (typeof parameters !== 'object' || parameters === null)
    throw new InvalidArgument('parameters', 'Object', parameters);
  const { onData, onEnd, blockSize } = parameters;
  if (!(onData instanceof Function))
    throw new InvalidArgument('parameters.onData', 'onData callback not set', onData);
  if (!(onEnd instanceof Function))
    throw new InvalidArgument('parameters.onEnd', 'onEnd callback not set', onEnd);
  if ('blockSize' in parameters && typeof blockSize !== 'number')
    throw new InvalidArgument('parameters.blockSize', 'Number', blockSize);
  if ('blockSize' in parameters && (isNaN(blockSize) || blockSize <= 0)) // eslint-disable-line no-restricted-globals
    throw new InvalidArgument('parameters.blockSize', 'blockSize must be strictly positive', blockSize);
}

