// @flow
import TankerCore from './Tanker';
import { type ShareWithOptions } from './DataProtection/ShareWithOptions';

// Note: to allow proper subclassing in @tanker/client-* packages, arguments
//       should be stricter and return values looser in the interface than in
//       subclasses (see: https://flow.org/en/docs/lang/variance/).
export interface EncryptionInterface {
  encryptData(clearData: Uint8Array, options?: ShareWithOptions): Promise<any>;
  decryptData<T>(encryptedData: Uint8Array, options?: { type?: Class<T> }): Promise<T>;
  encrypt(plain: string, options?: ShareWithOptions): Promise<Uint8Array>;
  decrypt(cipher: Uint8Array): Promise<string>;
}

export type TankerInterface = TankerCore & EncryptionInterface;
