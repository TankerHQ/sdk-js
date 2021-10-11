import type { b64string } from '@tanker/crypto';
import { utils } from '@tanker/crypto';
import type { Data, ResourceMetadata } from '@tanker/types';
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

  async encrypt(clearText: string, options?: Partial<ResourceMetadata & ProgressOptions>): Promise<Uint8Array>;
  async encrypt<T extends Data = Uint8Array>(clearText: string, options?: Partial<OutputOptions<T> & ProgressOptions>): Promise<T>;
  async encrypt(clearText: any, options: any): Promise<any> {
    assertNotEmptyString(clearText, 'clearText');
    return this.encryptData(utils.fromString(clearText), options);
  }

  async encryptData<I extends Data>(clearData: I, options?: Partial<ResourceMetadata & ProgressOptions>): Promise<I>;
  async encryptData<I extends Data, T extends Data>(clearData: I, options?: Partial<OutputOptions<T> & ProgressOptions>): Promise<T>;
  async encryptData(clearData: any, options: any = {}): Promise<any> {
    assertStatus(this._status, Status.READY, 'encrypt with an encryption session');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const progressOptions = extractProgressOptions(options);

    return this._dataProtector.encryptData(clearData, {}, outputOptions, progressOptions, this._resource);
  }

  async createEncryptionStream(): Promise<EncryptionStream> {
    assertStatus(this._status, Status.READY, 'create an encryption stream');
    return this._dataProtector.createEncryptionStream({}, this._resource);
  }
}
