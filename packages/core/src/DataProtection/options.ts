import type { b64string } from '@tanker/crypto';
import { tcrypto, utils, Padding, isPaddingStep } from '@tanker/crypto';
import { InternalError, InvalidArgument } from '@tanker/errors';
import { globalThis } from '@tanker/global-this';
import { getConstructor, assertNotEmptyString, assertInteger } from '@tanker/types';
import type { Class, Data, ResourceMetadata } from '@tanker/types';

import type { OnProgress } from './ProgressHandler';

const MAX_SHARE_RECIPIENTS = 100;

export const defaultDownloadType = globalThis.File ? globalThis.File : Uint8Array;

export type FormatOptions<T extends Data> = { type: Class<T>; };

export type OutputOptions<T extends Data> = FormatOptions<T> & ResourceMetadata;

export type ProgressOptions = { onProgress?: OnProgress; };

export type EncryptionOptions = {
  shareWithUsers?: Array<b64string>;
  shareWithGroups?: Array<string>;
  shareWithSelf?: boolean;
  paddingStep?: number | Padding | undefined;
};

export type SharingOptions = { shareWithUsers?: Array<b64string>; shareWithGroups?: Array<string>; };

export const isObject = (val: unknown): val is Record<string, any> => !!val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype;

export const extractSharingOptions = (options: Record<string, unknown>, error: unknown = new InvalidArgument('options', '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<b64string> }', options)): SharingOptions => {
  if (!isObject(options))
    throw error;

  const sharingOptions: SharingOptions = {};
  let recipientCount = 0;

  (['shareWithUsers', 'shareWithGroups'] as const).forEach(key => {
    if (key in options) {
      const array = options[key];
      if (!(array instanceof Array))
        throw error;
      array.forEach(el => assertNotEmptyString(el, `options.${key}`));
      sharingOptions[key] = array;
      recipientCount += array.length;
    }
  });

  if (recipientCount > MAX_SHARE_RECIPIENTS) {
    throw new InvalidArgument(
      'options.shareWith*',
      'it is not possible to share with more than 100 recipients at once',
      options,
    );
  }

  if (sharingOptions.shareWithGroups) {
    for (const groupId of sharingOptions.shareWithGroups) {
      utils.assertB64StringWithSize(groupId, 'options.shareWithGroups', tcrypto.SIGNATURE_PUBLIC_KEY_SIZE);
    }
  }

  return sharingOptions;
};

export const extractEncryptionOptions = (options: Record<string, unknown>): EncryptionOptions => {
  const error = new InvalidArgument('options', '{ shareWithUsers?: Array<b64string>, shareWithGroups?: Array<string>, shareWithSelf?: bool, paddingStep?: number | Padding }', options);

  const encryptionOptions: EncryptionOptions = extractSharingOptions(options, error);

  if ('shareWithSelf' in options) {
    if (typeof options['shareWithSelf'] !== 'boolean')
      throw error;
    encryptionOptions.shareWithSelf = options['shareWithSelf'];
  } else {
    encryptionOptions.shareWithSelf = true;
  }

  if ((!encryptionOptions.shareWithUsers || !encryptionOptions.shareWithUsers.length)
    && (!encryptionOptions.shareWithGroups || !encryptionOptions.shareWithGroups.length)
    && !encryptionOptions.shareWithSelf)
    throw new InvalidArgument('cannot encrypt and not share with anybody');

  if ('paddingStep' in options) {
    const ps = options['paddingStep'];

    if (!isPaddingStep(ps)) {
      throw error;
    }

    if (typeof ps === 'number') {
      assertInteger(ps, 'paddingStep', true);
    }

    encryptionOptions.paddingStep = ps;
  }

  return encryptionOptions;
};

export const isSharingOptionsEmpty = (opts: SharingOptions): boolean => {
  if (opts.shareWithGroups && opts.shareWithGroups.length > 0)
    return false;
  if (opts.shareWithUsers && opts.shareWithUsers.length > 0)
    return false;
  return true;
};

export const extractResourceMetadata = (options: Record<string, unknown>, input?: Data): ResourceMetadata => {
  if (!isObject(options))
    throw new InvalidArgument('options', '{ mime?: string, name?: string, lastModified?: number }', options);

  const resourceMetadata: ResourceMetadata = {};
  if (globalThis.Blob && input instanceof globalThis.Blob) {
    resourceMetadata.mime = (input as Blob).type;
  }
  if (globalThis.File && input instanceof globalThis.File) {
    resourceMetadata.name = (input as File).name;
    resourceMetadata.lastModified = (input as File).lastModified;
  }
  if (typeof options['mime'] === 'string') {
    resourceMetadata.mime = options['mime'];
  }
  if (typeof options['name'] === 'string') {
    resourceMetadata.name = options['name'];
  }
  if (typeof options['lastModified'] === 'number') {
    resourceMetadata.lastModified = options['lastModified'];
  }

  return resourceMetadata;
};

export const extractOutputOptions = <T extends Data>(options: Record<string, unknown>, input?: T): OutputOptions<T> => {
  if (!isObject(options))
    throw new InvalidArgument('options', '{ type: Class<T>, mime?: string, name?: string, lastModified?: number }', options);

  let outputType;

  if (options['type']) {
    outputType = options['type'] as Class<T>;
  } else if (input) {
    outputType = getConstructor(input);
  } else {
    throw new InternalError('Assertion error: called extractOutputOptions without a type or input');
  }

  const outputOptions: OutputOptions<T> = {
    ...(extractResourceMetadata(options, input) as Partial<OutputOptions<T>>),
    type: outputType,
  };

  return outputOptions;
};

export const extractProgressOptions = (options: Record<string, unknown>): ProgressOptions => {
  const progressOptions: ProgressOptions = {};

  if ('onProgress' in options) {
    if (typeof options['onProgress'] !== 'function')
      throw new InvalidArgument('options', '{ onProgress?: (progress: { currentBytes: number, totalBytes: ?number }) => void }', options);

    progressOptions.onProgress = options['onProgress'] as OnProgress;
  }

  return progressOptions;
};
