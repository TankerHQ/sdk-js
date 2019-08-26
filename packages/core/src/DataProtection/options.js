// @flow
import type { b64string } from '@tanker/crypto';
import FilePonyfill from '@tanker/file-ponyfill';
import globalThis from '@tanker/global-this';
import { getConstructor, type Data } from '@tanker/types';

import { InternalError, InvalidArgument } from '../errors';

export const defaultDownloadType = globalThis.File ? globalThis.File : Uint8Array;

export type OutputOptions<T: Data> = { type: Class<T>, mime?: string, name?: string, lastModified?: number };

export type ShareWithOptions = { shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> };

export const isObject = (val: Object) => !!val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype;

export const extractSharingOptions = (options: Object): ShareWithOptions => {
  const error = new InvalidArgument('options', '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> }', options);

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

export const isShareWithOptionsEmpty = (opts: ShareWithOptions): bool => {
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

  if (
    globalThis.Blob && outputType === globalThis.Blob
    || globalThis.File && outputType === globalThis.File
    || FilePonyfill && outputType === FilePonyfill
  ) {
    if (input instanceof globalThis.Blob) {
      outputOptions.mime = input.type;
    }
    if (input instanceof globalThis.File && (outputType === globalThis.File || outputType === FilePonyfill)) {
      outputOptions.name = input.name;
      outputOptions.lastModified = input.lastModified;
    }

    if (typeof options.mime === 'string') {
      outputOptions.mime = options.mime;
    }
    if (outputType === globalThis.File || outputType === globalThis.FilePonyfill) {
      if (typeof options.name === 'string') {
        outputOptions.name = options.name;
      }
      if (typeof options.lastModified === 'number') {
        outputOptions.lastModified = options.lastModified;
      }
    }
  }

  return outputOptions;
};
