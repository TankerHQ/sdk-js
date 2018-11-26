// @flow

import { InvalidArgument } from '../errors';

export function assertStreamParameters(parameters: any) {
  if (typeof parameters !== 'object' || parameters === null)
    throw new InvalidArgument('parameters', 'Object', parameters);
  const { onData, onEnd, outputSize } = parameters;
  if (!(onData instanceof Function))
    throw new InvalidArgument('parameters.onData', 'onData callback not set', onData);
  if (!(onEnd instanceof Function))
    throw new InvalidArgument('parameters.onEnd', 'onEnd callback not set', onEnd);
  if ('outputSize' in parameters && typeof outputSize !== 'number')
    throw new InvalidArgument('parameters.outputSize', 'Number', outputSize);
  if ('outputSize' in parameters && (isNaN(outputSize) || outputSize <= 0)) // eslint-disable-line no-restricted-globals
    throw new InvalidArgument('parameters.outputSize', 'outputSize must be strictly positive', outputSize);
}

