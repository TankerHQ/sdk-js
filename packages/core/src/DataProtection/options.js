// @flow
import type { b64string } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import globalThis from '@tanker/global-this';
import { getConstructor, type Data } from '@tanker/types';

import type { OnProgress } from './ProgressHandler';

export const defaultDownloadType = globalThis.File ? globalThis.File : Uint8Array;

export type OutputOptions<T: Data> = { type: Class<T>, mime?: string, name?: string, lastModified?: number };

export type ProgressOptions = { onProgress?: OnProgress };

export type EncryptionOptions = { shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string>, shareWithSelf?: bool };

export type SharingOptions = { shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> };

export const isObject = (val: Object) => !!val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype;

export const extractSharingOptions = (options: Object, error: any = new InvalidArgument('options', '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> }', options)): SharingOptions => {
  if (!isObject(options))
    throw error;

  const sharingOptions = {};

  ['shareWithUsers', 'shareWithGroups'].forEach(key => {
    if (key in options) {
      if (!(options[key] instanceof Array))
        throw error;
      if (options[key].some(el => typeof el !== 'string'))
        throw error;

      sharingOptions[key] = options[key];
    }
  });

  return sharingOptions;
};

export const extractEncryptionOptions = (options: Object): EncryptionOptions => {
  const error = new InvalidArgument('options', '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string>, shareWithSelf?: bool }', options);

  // $FlowIgnore casting SharingOptions to EncryptionOptions is safe
  const encryptionOptions: EncryptionOptions = extractSharingOptions(options, error);

  if ('shareWithSelf' in options) {
    if (typeof options.shareWithSelf !== 'boolean')
      throw error;
    encryptionOptions.shareWithSelf = options.shareWithSelf;
  } else {
    encryptionOptions.shareWithSelf = true;
  }

  if ((!encryptionOptions.shareWithUsers || !encryptionOptions.shareWithUsers.length)
    && (!encryptionOptions.shareWithGroups || !encryptionOptions.shareWithGroups.length)
    && !encryptionOptions.shareWithSelf)
    throw new InvalidArgument('cannot encrypt and not share with anybody');

  return encryptionOptions;
};

export const isSharingOptionsEmpty = (opts: SharingOptions): bool => {
  if (opts.shareWithGroups && opts.shareWithGroups.length > 0)
    return false;
  if (opts.shareWithUsers && opts.shareWithUsers.length > 0)
    return false;
  return true;
};

export const extractOutputOptions = <T: Data>(options: Object, input?: Data): OutputOptions<T> => {
  if (!isObject(options))
    throw new InvalidArgument('options', '{ type: Class<T>, mime?: string, name?: string, lastModified?: number }', options);

  let outputType;

  if (options.type) {
    outputType = options.type;
  } else if (input) {
    outputType = getConstructor(input);
  } else {
    throw new InternalError('Assertion error: called extractOutputOptions without a type or input');
  }

  const outputOptions = {};
  outputOptions.type = outputType;

  if (globalThis.Blob && input instanceof globalThis.Blob) {
    outputOptions.mime = input.type;
  }
  if (globalThis.File && input instanceof globalThis.File) {
    outputOptions.name = input.name;
    outputOptions.lastModified = input.lastModified;
  }

  if (typeof options.mime === 'string') {
    outputOptions.mime = options.mime;
  }
  if (typeof options.name === 'string') {
    outputOptions.name = options.name;
  }
  if (typeof options.lastModified === 'number') {
    outputOptions.lastModified = options.lastModified;
  }

  return outputOptions;
};

export const extractProgressOptions = (options: Object): ProgressOptions => {
  const progressOptions = {};

  if ('onProgress' in options) {
    if (typeof options.onProgress !== 'function')
      throw new InvalidArgument('options', '{ onProgress?: (progress: { currentBytes: number, totalBytes: ?number }) => void }', options);

    progressOptions.onProgress = options.onProgress;
  }

  return progressOptions;
};
