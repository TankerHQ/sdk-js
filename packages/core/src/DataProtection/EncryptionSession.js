// @flow

import { utils, type b64string } from '@tanker/crypto';
import { InvalidArgument } from '@tanker/errors';
import type { Data } from '@tanker/types';
import { assertDataType } from '@tanker/types';

import { assertStatus, statuses, type Status } from '../Session/status';
import type { OutputOptions, ProgressOptions } from './options';
import { extractOutputOptions, extractProgressOptions } from './options';
import type { DataProtector } from './DataProtector';

export class EncryptionSession {
  _dataProtector: DataProtector;
  _b64ResourceId: b64string;
  _status: Status;

  constructor(dataProtector: DataProtector, resourceId: b64string) {
    this._dataProtector = dataProtector;
    this._b64ResourceId = resourceId;
    this._status = statuses.READY;
  }

  statusChange(newStatus: Status) {
    this._status = newStatus;
  }

  get resourceId(): b64string {
    return this._b64ResourceId;
  }

  async encrypt<T: Data>(clearText: string, options?: $Shape<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    if (typeof clearText !== 'string')
      throw new InvalidArgument('clearText', 'string', clearText);

    return this.encryptData(utils.fromString(clearText), options);
  }

  async encryptData<T: Data>(clearData: Data, options?: $Shape<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertStatus(this._status, statuses.READY, 'encrypt with an encryption session');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const progressOptions = extractProgressOptions(options);

    return this._dataProtector.encryptData(clearData, {}, outputOptions, progressOptions, this._b64ResourceId);
  }
}