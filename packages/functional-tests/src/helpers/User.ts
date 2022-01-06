import { getPublicIdentity, createIdentity } from '@tanker/identity';
import { uuid } from '@tanker/test-utils';

import { Device } from './Device';
import type { TankerFactory } from './Device';

export class User {
  makeTanker: TankerFactory;
  appId: string;
  identity: string;
  spublicIdentity: string;

  constructor(makeTanker: TankerFactory, appId: string, identity: string, publicIdentity: string) {
    this.makeTanker = makeTanker;
    this.appId = appId;
    this.identity = identity;
    this.spublicIdentity = publicIdentity;
  }

  static async create(makeTanker: TankerFactory, appId: string, appSecret: string): Promise<User> {
    const identity = await createIdentity(appId, appSecret, uuid.v4());
    return new User(makeTanker, appId, identity, await getPublicIdentity(identity));
  }

  makeDevice(): Promise<Device> {
    return Device.create(this.makeTanker, this.appId, this.identity);
  }
}
