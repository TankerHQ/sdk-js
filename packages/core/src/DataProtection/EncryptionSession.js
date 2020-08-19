// @flow

import { utils, type b64string } from '@tanker/crypto';
import { type Data, assertDataType, assertNotEmptyString } from '@tanker/types';

import { assertStatus, statuses, type Status } from '../Session/status';
import type { OutputOptions, ProgressOptions } from './options';
import { extractOutputOptions, extractProgressOptions } from './options';
import type { DataProtector } from './DataProtector';
import type { Resource } from './types';

export class EncryptionSession {
  _dataProtector: DataProtector;
  _resource: Resource;
  _status: Status;

  constructor(dataProtector: DataProtector, resource: Resource) {
    this._dataProtector = dataProtector;
    this._resource = resource;
    this._status = statuses.READY;
  }

  statusChange(newStatus: Status) {
    this._status = newStatus;
  }

  get resourceId(): b64string {
    return utils.toBase64(this._resource.resourceId);
  }

  async encrypt<T: Data>(clearText: string, options?: $Shape<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertNotEmptyString(clearText, 'clearText');
    return this.encryptData(utils.fromString(clearText), options);
  }

  async encryptData<T: Data>(clearData: Data, options?: $Shape<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertStatus(this._status, statuses.READY, 'encrypt with an encryption session');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const progressOptions = extractProgressOptions(options);

    return this._dataProtector.encryptData(clearData, {}, outputOptions, progressOptions, this._resource);
  }
}
