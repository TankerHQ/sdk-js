import type { DataStoreOptions } from './UnauthSessionStorage';
import UnauthSessionStorage from './UnauthSessionStorage';

import OidcNonceManager from '../OidcNonce/Manager';
import type { b64string } from '..';

export class UnauthSession {
  _storage: UnauthSessionStorage;

  _oidcNonceManager: OidcNonceManager;

  constructor(storage: UnauthSessionStorage) {
    this._storage = storage;
    this._oidcNonceManager = new OidcNonceManager(storage.oidcStore);
  }

  static start = async (appId: b64string, storeOptions: DataStoreOptions): Promise<UnauthSession> => {
    const storage = new UnauthSessionStorage(storeOptions);
    await storage.open(appId);

    return new UnauthSession(storage);
  };

  stop = async (): Promise<void> => {
    await this._storage.close();
  };

  _syncForward = <
    Obj extends { [k in Key]: (...args: any) => any },
    Key extends string,
  >(
    managerGetter: () => Obj,
    func: Key,
  ) => (...args: Parameters<Obj[Key]>): ReturnType<Obj[Key]> => {
    const manager = managerGetter();
    return manager[func].call(manager, ...args);
  };

  // Getter are used to only access managers after they have been initialized
  getOidcNonceManager = () => this._oidcNonceManager;

  createOidcNonce = this._syncForward(this.getOidcNonceManager, 'createOidcNonce');
}
