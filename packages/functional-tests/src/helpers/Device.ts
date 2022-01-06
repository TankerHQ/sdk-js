import { Tanker } from '@tanker/core';
import { uuid } from '@tanker/test-utils';

export type TankerFactory = (appId: string, storagePrefix: string) => Tanker;

const VERIFICATION = { passphrase: 'passphrase' };

export class Device {
  makeTanker: TankerFactory;
  appId: string;
  identity: string;
  storagePrefix: string;

  constructor(makeTanker: TankerFactory, appId: string, identity: string, storagePrefix: string) {
    this.makeTanker = makeTanker;
    this.appId = appId;
    this.identity = identity;
    this.storagePrefix = storagePrefix;
  }

  static async create(makeTanker: (appId: string, storagePrefix: string) => Tanker, appId: string, identity: string): Promise<Device> {
    return new Device(makeTanker, appId, identity, uuid.v4());
  }

  async open(): Promise<Tanker> {
    const tanker = this.makeTanker(
      this.appId,
      this.storagePrefix,
    );
    const status = await tanker.start(this.identity);
    if (status === Tanker.statuses.IDENTITY_REGISTRATION_NEEDED)
      await tanker.registerIdentity(VERIFICATION);
    else if (status === Tanker.statuses.IDENTITY_VERIFICATION_NEEDED)
      await tanker.verifyIdentity(VERIFICATION);
    return tanker;
  }
}
