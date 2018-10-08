// @flow

import { utils, type b64string } from '@tanker/crypto';

import { InvalidArgument } from '../errors';

export type ServerToken = {|
  version: number,
  type: string,
  settings: Object,
|};

function extractServerTokenV1(settings: Object): Object {
  if (!settings.userToken || typeof settings.userToken !== 'string')
    throw new InvalidArgument('serverToken.settings.userToken', 'string', settings.userToken);
  if (!settings.unlockKey || typeof settings.unlockKey !== 'string')
    throw new InvalidArgument('serverToken.settings.unlockKey', 'string', settings.unlockKey);
  return settings;
}

export function isServerToken(sessionTokenB64: b64string): bool {
  try {
    const token = utils.fromB64Json(sessionTokenB64);
    return typeof token.version === 'number';
  } catch (e) {
    return false;
  }
}

export function extractFromServerToken(serverToken: ServerToken): Object {
  if (!serverToken || typeof serverToken !== 'object')
    throw new InvalidArgument('serverToken', 'object', serverToken);

  if (!serverToken.version || typeof serverToken.version !== 'number')
    throw new InvalidArgument('serverToken.version', 'number', serverToken.version);

  if (!serverToken.type || typeof serverToken.type !== 'string' || serverToken.type !== 'serverToken')
    throw new InvalidArgument('serverToken.version', 'value must be "serverToken"', serverToken.type);

  if (!serverToken.settings || typeof serverToken.settings !== 'object')
    throw new InvalidArgument('serverToken.settings', 'object', serverToken.settings);

  switch (serverToken.version) {
    case 1:
      return extractServerTokenV1(serverToken.settings);
    default:
      throw new InvalidArgument('serverToken.version', 'version is not supported', serverToken.version);
  }
}
