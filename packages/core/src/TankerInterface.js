// @flow
import TankerCore from './Tanker';
import { type EncryptionOptions } from './DataProtection/EncryptionOptions';

// Note: due to variations in subclassing implementations (node vs. browsers),
//       arguments should be stricter and return values looser in the interface
//       than in implementations (see: https://flow.org/en/docs/lang/variance/).
export interface EncryptionInterface {
  encryptData(clearData: Uint8Array, options?: EncryptionOptions): Promise<any>;
  decryptData(encryptedData: Uint8Array, options?: { type?: 'Uint8Array' }): Promise<any>;
  encrypt(plain: string, options?: EncryptionOptions): Promise<Uint8Array>;
  decrypt(cipher: Uint8Array): Promise<string>;
}

export type TankerInterface = TankerCore & EncryptionInterface;
