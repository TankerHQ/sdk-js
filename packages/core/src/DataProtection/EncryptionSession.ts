import type { b64string, EncryptionStream, Padding } from '@tanker/crypto';
import { utils } from '@tanker/crypto';
import type { Data, ResourceMetadata } from '@tanker/types';
import { assertDataType, assertNotEmptyString } from '@tanker/types';

import { Status, assertStatus } from '../Session/status';
import type { OutputOptions, ProgressOptions } from './options';
import { extractOutputOptions, extractProgressOptions } from './options';
import type { DataProtector } from './DataProtector';
import type { Resource } from './types';

export class EncryptionSession {
  _dataProtector: DataProtector;
  _resource: Resource;
  _paddingStep?: number | Padding;
  _getStatus: () => Status;

  constructor(dataProtector: DataProtector, getStatus: () => Status, resource: Resource, paddingStep?: number | Padding) {
    this._dataProtector = dataProtector;
    this._resource = resource;
    this._getStatus = getStatus;
    this._paddingStep = paddingStep;
  }

  get resourceId(): b64string {
    return utils.toBase64(this._resource.resourceId);
  }

  async encrypt(clearText: string, options?: ResourceMetadata & ProgressOptions): Promise<Uint8Array>;
  async encrypt<T extends Data>(clearText: string, options?: OutputOptions<T> & ProgressOptions): Promise<T>;
  async encrypt(clearText: string, options?: Partial<OutputOptions<Data> & ProgressOptions>): Promise<any> {
    assertNotEmptyString(clearText, 'clearText');
    return this.encryptData(utils.fromString(clearText), options);
  }

  async encryptData<I extends Data>(clearData: I, options?: ResourceMetadata & ProgressOptions): Promise<I>;
  async encryptData<T extends Data>(clearData: Data, options?: OutputOptions<T> & ProgressOptions): Promise<T>;
  async encryptData(clearData: Data, options: Partial<OutputOptions<Data> & ProgressOptions> = {}): Promise<any> {
    assertStatus(this._getStatus(), Status.READY, 'encrypt with an encryption session');
    assertDataType(clearData, 'clearData');

    const outputOptions = extractOutputOptions(options, clearData);
    const progressOptions = extractProgressOptions(options);

    return this._dataProtector.encryptDataWithResource(clearData, { paddingStep: this._paddingStep }, outputOptions, progressOptions, this._resource);
  }

  async createEncryptionStream(): Promise<EncryptionStream> {
    assertStatus(this._getStatus(), Status.READY, 'create an encryption stream');
    return this._dataProtector.createEncryptionStreamWithResource({ paddingStep: this._paddingStep }, this._resource);
  }
}
