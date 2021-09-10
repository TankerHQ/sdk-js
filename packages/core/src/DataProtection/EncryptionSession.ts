import type { b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';
import type { Data } from '@tanker/types';
import { assertDataType, assertNotEmptyString } from '@tanker/types';

import { Status, assertStatus } from '../Session/status';
import type { OutputOptions, ProgressOptions } from './options';
import { extractOutputOptions, extractProgressOptions } from './options';
import type { DataProtector } from './DataProtector';
import type { EncryptionStream } from './EncryptionStream';
import type { Resource } from './types';

export class EncryptionSession {
  _dataProtector: DataProtector;
  _resource: Resource;
  _status: Status;

  constructor(dataProtector: DataProtector, resource: Resource) {
    this._dataProtector = dataProtector;
    this._resource = resource;
    this._status = Status.READY;
  }

  statusChange(newStatus: Status) {
    this._status = newStatus;
  }

  get resourceId(): b64string {
    return utils.toBase64(this._resource.resourceId);
  }

  async encrypt<T extends Data>(clearText: string, options: Partial<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertNotEmptyString(clearText, 'clearText');
    return this.encryptData(utils.fromString(clearText), options);
  }

  async encryptData<T extends Data>(clearData: Data, options: Partial<OutputOptions<T> & ProgressOptions> = {}): Promise<T> {
    assertStatus(this._status, Status.READY, 'encrypt with an encryption session');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions<T>(options, clearData);
    const progressOptions = extractProgressOptions(options);

    return this._dataProtector.encryptData<T>(clearData, {}, outputOptions, progressOptions, this._resource);
  }

  async createEncryptionStream(): Promise<EncryptionStream> {
    assertStatus(this._status, Status.READY, 'create an encryption stream');
    return this._dataProtector.createEncryptionStream({}, this._resource);
  }
}
