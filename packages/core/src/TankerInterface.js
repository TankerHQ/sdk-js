// @flow
import TankerCore from './Tanker';
import { type EncryptionOptions } from './DataProtection/EncryptionOptions';

// Note: to allow proper subclassing in @tanker/client-* packages, arguments
//       should be stricter and return values looser in the interface than in
//       subclasses (see: https://flow.org/en/docs/lang/variance/).
export interface EncryptionInterface {
  encryptData(clearData: Uint8Array, options?: EncryptionOptions): Promise<any>;
  decryptData<T>(encryptedData: Uint8Array, options?: { type?: Class<T> }): Promise<T>;
  encrypt(plain: string, options?: EncryptionOptions): Promise<Uint8Array>;
  decrypt(cipher: Uint8Array): Promise<string>;
}

export type TankerInterface = TankerCore & EncryptionInterface;
