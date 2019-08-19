// @flow
import type { b64string } from '@tanker/crypto';
import FilePonyfill from '@tanker/file-ponyfill';
import globalThis from '@tanker/global-this';
import { getConstructor, type Data } from '@tanker/types';

import { InternalError, InvalidArgument } from '../errors';

export const defaultDownloadType = globalThis.File ? globalThis.File : Uint8Array;

export type OutputOptions<T: Data> = { type: Class<T>, mime?: string, name?: string, lastModified?: number };

export type ShareWithOptions = { shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> };

type ExtractedOptions<T> = {
  outputOptions: OutputOptions<T>,
  sharingOptions: ShareWithOptions,
};

const validateShareWithOptions = (value: ShareWithOptions): bool => {
  if (!value || typeof value !== 'object' || value instanceof Array)
    return false;

  const keysToCheck = ['shareWithGroups', 'shareWithUsers'];
  const keys = Object.keys(value).filter(key => keysToCheck.indexOf(key) !== -1);

  for (const key of keys) {
    if (!(value[key] instanceof Array))
      return false;
    if (value[key].some(el => typeof el !== 'string'))
      return false;
  }

  return true;
};

export const assertShareWithOptions = (value: ShareWithOptions, argName: string = 'options') => {
  if (!validateShareWithOptions(value)) {
    throw new InvalidArgument(argName, '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> }', value);
  }
};

export const isShareWithOptionsEmpty = (opts: ShareWithOptions): bool => {
  if (opts.shareWithGroups && opts.shareWithGroups.length > 0)
    return false;
  if (opts.shareWithUsers && opts.shareWithUsers.length > 0)
    return false;
  return true;
};

export const extractOptions = <T: Data>(options: Object, input?: Data): ExtractedOptions<T> => {
  if (!options || typeof options !== 'object' || options instanceof Array)
    throw new InvalidArgument('options', 'a combination of ShareWithOptions and OutputOptions', options);

  let outputType;

  if (options.type) {
    outputType = options.type;
  } else if (input) {
    outputType = getConstructor(input);
  } else {
    throw new InternalError('Assertion error: called extractOptions without a type or input');
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

  const sharingOptions = {};

  ['shareWithUsers', 'shareWithGroups'].forEach(key => {
    if (key in options) {
      sharingOptions[key] = options[key];
    }
  });

  if (!validateShareWithOptions(sharingOptions))
    throw new InvalidArgument('options', '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string> }', options);

  return { outputOptions, sharingOptions };
};
